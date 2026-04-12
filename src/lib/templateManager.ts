import {
  addDoc,
  collection,
  doc,
  getDoc,
  orderBy,
  query,
  setDoc,
  where,
  getDocs,
} from 'firebase/firestore';
import localforage from 'localforage';
import {
  AuditSection,
  AuditTemplate,
  ChecklistItem,
  ComplianceStatus,
  TemplateReportDefaults,
  TemplateRiskSettings,
  TemplateSection,
} from '../types';
import {
  CHECKLIST_TEMPLATES,
  DEFAULT_NARRATIVE,
  NEGATIVE_RESPONSE_OPTIONS,
  POSITIVE_RESPONSE_OPTIONS,
  RISK_LEVELS,
} from '../constants';
import { db } from './firebase';

const TEMPLATE_COLLECTION = 'auditTemplates';
const TEMPLATE_VERSION_COLLECTION = 'auditTemplateVersions';
const ACTIVE_TEMPLATE_DOC_ID = 'active';
const ADMIN_USERS_COLLECTION = 'adminUsers';
const LOCAL_TEMPLATE_KEY = 'local_audit_template';

const DEFAULT_RISK_SETTINGS: TemplateRiskSettings = {
  likelihood: RISK_LEVELS.LIKELIHOOD.map((v) => ({ ...v })),
  severity: RISK_LEVELS.SEVERITY.map((v) => ({ ...v })),
  bands: [
    { band: 'Low', min: 1, max: 4 },
    { band: 'Moderate', min: 5, max: 9 },
    { band: 'High', min: 10, max: 15 },
    { band: 'Very High', min: 16, max: 25 },
  ],
  priorityMapping: [
    { band: 'Low', priority: 'Low' },
    { band: 'Moderate', priority: 'Medium' },
    { band: 'High', priority: 'High' },
    { band: 'Very High', priority: 'Urgent' },
  ],
};

const DEFAULT_REPORT_DEFAULTS: TemplateReportDefaults = {
  introduction: DEFAULT_NARRATIVE.introduction,
  scope: DEFAULT_NARRATIVE.scope,
  methodology: DEFAULT_NARRATIVE.methodology,
  legislation: DEFAULT_NARRATIVE.legislation,
  disclaimer: DEFAULT_NARRATIVE.disclaimer,
  conclusion: DEFAULT_NARRATIVE.conclusion,
};

const createTemplateItem = (item: ChecklistItem, index: number): ChecklistItem => ({
  ...item,
  active: item.active ?? true,
  displayOrder: item.displayOrder ?? index + 1,
  answerType: 'default',
  notesRequired: item.notesRequired ?? false,
  photosAllowed: item.photosAllowed ?? true,
  negativeCreatesFinding: item.negativeCreatesFinding ?? true,
  positiveOptions: item.positiveOptions ?? [...POSITIVE_RESPONSE_OPTIONS],
  negativeOptions: item.negativeOptions ?? [...NEGATIVE_RESPONSE_OPTIONS],
  defaultLikelihood: item.defaultLikelihood ?? 3,
  defaultSeverity: item.defaultSeverity ?? 3,
});

const defaultTemplateSections: TemplateSection[] = CHECKLIST_TEMPLATES.map((section, idx) => ({
  id: section.id,
  title: section.title,
  active: true,
  displayOrder: idx + 1,
  notes: section.notes || '',
  subsections: [],
  items: section.items.map((item, itemIdx) => createTemplateItem(item, itemIdx)),
}));

export const createDefaultTemplate = (): AuditTemplate => {
  const now = new Date().toISOString();
  return {
    id: ACTIVE_TEMPLATE_DOC_ID,
    name: 'Default SafeOffice Audit Template',
    description: 'Default active audit template',
    active: true,
    version: 1,
    mainResponseOptions: ['positive', 'negative', 'na'],
    sections: defaultTemplateSections,
    riskSettings: DEFAULT_RISK_SETTINGS,
    reportDefaults: DEFAULT_REPORT_DEFAULTS,
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeTemplate = (template: AuditTemplate): AuditTemplate => {
  const normalizedSections = [...(template.sections || [])]
    .map((section, index) => ({
      ...section,
      active: section.active ?? true,
      displayOrder: section.displayOrder ?? index + 1,
      subsections: [...(section.subsections || [])]
        .map((sub, subIdx) => ({
          ...sub,
          active: sub.active ?? true,
          displayOrder: sub.displayOrder ?? subIdx + 1,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder),
      items: [...(section.items || [])]
        .map((item, itemIdx) => createTemplateItem(item, itemIdx))
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    ...template,
    mainResponseOptions: (template.mainResponseOptions || ['positive', 'negative', 'na']) as ComplianceStatus[],
    sections: normalizedSections,
    riskSettings: template.riskSettings || DEFAULT_RISK_SETTINGS,
    reportDefaults: {
      ...DEFAULT_REPORT_DEFAULTS,
      ...(template.reportDefaults || {}),
    },
  };
};

export const getActiveTemplateFromFirebase = async (): Promise<AuditTemplate> => {
  // Prefer locally-saved customisations (set by non-admin users or offline edits)
  const local = await localforage.getItem<AuditTemplate>(LOCAL_TEMPLATE_KEY);
  if (local) {
    return normalizeTemplate(local);
  }

  try {
    const templateRef = doc(db, TEMPLATE_COLLECTION, ACTIVE_TEMPLATE_DOC_ID);
    const snap = await getDoc(templateRef);
    if (snap.exists()) {
      return normalizeTemplate(snap.data() as AuditTemplate);
    }
  } catch {
    // Firestore unavailable or permission denied – fall through to default
  }

  return createDefaultTemplate();
};

export const saveActiveTemplateToFirebase = async (
  template: AuditTemplate,
  updatedBy?: string,
): Promise<AuditTemplate> => {
  const now = new Date().toISOString();
  const nextVersion = (template.version || 0) + 1;
  const payload: AuditTemplate = normalizeTemplate({
    ...template,
    id: ACTIVE_TEMPLATE_DOC_ID,
    active: true,
    version: nextVersion,
    updatedAt: now,
    updatedBy,
    createdAt: template.createdAt || now,
  });

  // Always persist locally so non-admin users can save their customisations
  await localforage.setItem(LOCAL_TEMPLATE_KEY, payload);

  // Also try to persist to Firestore (succeeds for admin users)
  try {
    await setDoc(doc(db, TEMPLATE_COLLECTION, ACTIVE_TEMPLATE_DOC_ID), payload);
    await addDoc(collection(db, TEMPLATE_VERSION_COLLECTION), payload);
  } catch {
    // Non-admin users lack write permission – local save above is sufficient
  }

  return payload;
};

export const isUserAdmin = async (uid: string, email: string | null): Promise<boolean> => {
  if (!uid) return false;

  const envAdmins = (((import.meta as any).env?.VITE_ADMIN_EMAILS as string) || '')
    .split(',')
    .map((v: string) => v.trim().toLowerCase())
    .filter(Boolean);

  if (email && envAdmins.includes(email.toLowerCase())) {
    return true;
  }

  const docSnap = await getDoc(doc(db, ADMIN_USERS_COLLECTION, uid));
  if (docSnap.exists()) {
    return Boolean(docSnap.data().active ?? true);
  }

  return false;
};

export const getLatestTemplateVersions = async (max = 20): Promise<AuditTemplate[]> => {
  const q = query(
    collection(db, TEMPLATE_VERSION_COLLECTION),
    where('id', '==', ACTIVE_TEMPLATE_DOC_ID),
    orderBy('updatedAt', 'desc'),
  );

  const snap = await getDocs(q);
  return snap.docs.slice(0, max).map((d) => normalizeTemplate(d.data() as AuditTemplate));
};

export const templateToAuditSections = (template: AuditTemplate): AuditSection[] => {
  const sortedSections = [...template.sections]
    .filter((section) => section.active)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return sortedSections.map((section) => ({
    id: section.id,
    title: section.title,
    subsections: [...section.subsections]
      .filter((sub) => sub.active)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((sub) => ({ ...sub })),
    notes: section.notes || '',
    items: [...section.items]
      .filter((item) => item.active !== false)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((item) => ({
        id: item.id,
        question: item.question,
        status: 'na',
        comment: '',
        subsectionId: item.subsectionId,
        helpText: item.helpText,
        answerType: item.answerType || 'default',
        active: item.active ?? true,
        displayOrder: item.displayOrder,
        notesRequired: item.notesRequired ?? false,
        photosAllowed: item.photosAllowed ?? true,
        negativeCreatesFinding: item.negativeCreatesFinding ?? true,
        negativeFinding: item.negativeFinding,
        defaultRecommendedAction: item.defaultRecommendedAction,
        defaultLikelihood: item.defaultLikelihood,
        defaultSeverity: item.defaultSeverity,
        positiveOptions: item.positiveOptions && item.positiveOptions.length > 0
          ? [...item.positiveOptions]
          : [...POSITIVE_RESPONSE_OPTIONS],
        negativeOptions: item.negativeOptions && item.negativeOptions.length > 0
          ? [...item.negativeOptions]
          : [...NEGATIVE_RESPONSE_OPTIONS],
      })),
  }));
};

export const getTemplateForNewAudit = async () => {
  const template = await getActiveTemplateFromFirebase();
  return {
    template,
    sections: templateToAuditSections(template),
    reportDefaults: template.reportDefaults,
  };
};
