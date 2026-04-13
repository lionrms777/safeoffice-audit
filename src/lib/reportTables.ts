import { Action, Audit, Finding } from '../types';

export interface ItemPhotoPart {
  photoUrl: string;
  photoPath: string;
  photoDataUrl: string;
}

export interface ReportFindingRow {
  refCode: string;
  findingId: string;
  sectionTitle: string;
  title: string;
  observation: string;
  inspectorNotes: string;
  actionReference: string;
  riskBand: Finding['riskBand'];
  riskScore: number;
  photos: ItemPhotoPart[];
  hasPhotoRef: boolean;
}

export interface ReportActionRow {
  refCode: string;
  actionId: string;
  findingId: string;
  shortFindingTitle: string;
  actionRequired: string;
  priority: Action['priority'];
  responsiblePerson?: string;
  targetDate?: string;
  status: Action['status'];
}

const getUniqueFindings = (audit: Audit): Finding[] => {
  return (audit.findings || [])
    .filter((finding, index, all) => all.findIndex((candidate) => candidate.itemId === finding.itemId) === index)
    .sort((left, right) => {
      const sectionCompare = left.sectionTitle.localeCompare(right.sectionTitle);
      if (sectionCompare !== 0) return sectionCompare;
      const riskCompare = right.riskScore - left.riskScore;
      if (riskCompare !== 0) return riskCompare;
      return left.title.localeCompare(right.title);
    });
};

const getFindingEvidence = (audit: Audit, finding: Finding) => {
  const section = audit.sections.find((candidate) => candidate.id === finding.sectionId);
  const item = section?.items.find((candidate) => candidate.id === finding.itemId);

  const photos: ItemPhotoPart[] = [];

  // Collect from new photos[] array first
  if (item?.photos && item.photos.length > 0) {
    for (const photo of item.photos) {
      photos.push({
        photoUrl: photo.url || '',
        photoPath: photo.path || '',
        photoDataUrl: photo.dataUrl || '',
      });
    }
  }

  // Fall back to legacy single-photo fields if no array photos
  if (photos.length === 0 && (item?.photoUrl || item?.photoPath || item?.photoDataUrl)) {
    photos.push({
      photoUrl: item?.photoUrl || '',
      photoPath: item?.photoPath || '',
      photoDataUrl: item?.photoDataUrl || '',
    });
  }

  return {
    inspectorNotes: item?.comment?.trim() || '',
    photos,
    hasPhotoRef: photos.length > 0,
  };
};

const getFindingRefMap = (findings: Finding[]) => {
  return new Map(findings.map((finding, index) => [finding.id, `F${index + 1}`]));
};

const getShortFindingTitle = (title?: string, observation?: string) => {
  const cleanTitle = (title || '').trim();
  if (cleanTitle) return cleanTitle;

  const firstSentence = (observation || '')
    .split(/[\n.]/)
    .map((part) => part.trim())
    .find(Boolean);

  return firstSentence || 'Finding';
};

export const buildReportFindingRows = (audit: Audit): ReportFindingRow[] => {
  const findings = getUniqueFindings(audit);
  const findingRefMap = getFindingRefMap(findings);

  return findings.map((finding) => {
    const evidence = getFindingEvidence(audit, finding);
    const refCode = findingRefMap.get(finding.id) || 'F-';

    return {
      refCode,
      findingId: finding.id,
      sectionTitle: finding.sectionTitle,
      title: finding.title,
      observation: finding.observation,
      inspectorNotes: evidence.inspectorNotes,
      actionReference: `See Action Plan: ${refCode}`,
      riskBand: finding.riskBand,
      riskScore: finding.riskScore,
      photos: evidence.photos,
      hasPhotoRef: evidence.hasPhotoRef,
    };
  });
};

export const buildReportActionRows = (
  audit: Audit,
  findingRows = buildReportFindingRows(audit),
): ReportActionRow[] => {
  const findingRefMap = new Map(findingRows.map((row) => [row.findingId, row.refCode]));

  return (audit.actions || [])
    .filter((action, index, all) => all.findIndex((candidate) => candidate.id === action.id) === index)
    .sort((left, right) => {
      const leftRef = findingRefMap.get(left.findingId) || 'Z9999';
      const rightRef = findingRefMap.get(right.findingId) || 'Z9999';
      const refCompare = leftRef.localeCompare(rightRef, undefined, { numeric: true });
      if (refCompare !== 0) return refCompare;
      return left.actionRequired.localeCompare(right.actionRequired);
    })
    .map((action) => ({
      refCode: findingRefMap.get(action.findingId) || 'F-',
      actionId: action.id,
      findingId: action.findingId,
      shortFindingTitle: getShortFindingTitle(action.findingTitle, action.actionRequired),
      actionRequired: action.actionRequired,
      priority: action.priority,
      responsiblePerson: action.responsiblePerson,
      targetDate: action.targetDate,
      status: action.status,
    }));
};
