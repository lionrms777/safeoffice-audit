export type AuditStatus = 'draft' | 'completed';

export type ComplianceStatus = 'positive' | 'negative' | 'na';

export type FindingStatus = 'Open' | 'Closed' | 'In Progress';

export type RiskBand = 'Low' | 'Moderate' | 'High' | 'Very High';

export interface ChecklistItem {
  id: string;
  question: string;
  status: ComplianceStatus;
  comment: string;
  subsectionId?: string;
  helpText?: string;
  answerType?: 'default';
  active?: boolean;
  displayOrder?: number;
  notesRequired?: boolean;
  photosAllowed?: boolean;
  negativeCreatesFinding?: boolean;
  defaultRecommendedAction?: string;
  defaultLikelihood?: number;
  defaultSeverity?: number;
  positiveOptions?: string[];
  negativeOptions?: string[];
  positiveStatement?: string;
  negativeFinding?: string;
  observation?: string;
  photoUrl?: string;
  photoPath?: string;
  photoDataUrl?: string;
}

export interface AuditSection {
  id: string;
  title: string;
  items: ChecklistItem[];
  subsections?: TemplateSubsection[];
  notes?: string;
}

export interface Finding {
  id: string;
  itemId: string;
  sectionId: string;
  sectionTitle: string;
  title: string;
  observation: string;
  recommendedAction: string;
  likelihood: number;
  severity: number;
  calculatedRiskScore?: number;
  calculatedRiskBand?: RiskBand;
  finalRiskRating?: RiskBand;
  riskScore: number;
  riskBand: RiskBand;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | 'Critical';
  targetDate?: string;
  responsiblePerson?: string;
  status: FindingStatus;
}

export interface Action {
  id: string;
  findingId: string;
  findingTitle: string;
  actionRequired: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | 'Critical';
  likelihood: number;
  severity: number;
  calculatedRiskScore?: number;
  calculatedRiskBand?: RiskBand;
  finalRiskRating?: RiskBand;
  riskBand?: RiskBand;
  riskScore: number;
  responsiblePerson?: string;
  targetDate?: string;
  status: FindingStatus;
  comments?: string;
}

export interface Audit {
  id: string;
  userId?: string;
  assessmentReference?: string;
  clientName: string;
  siteName: string;
  siteAddress: string;
  departmentArea?: string;
  locationLayout?: string;
  taskActivityProcess?: string;
  responsiblePerson?: string;
  reviewDate?: string;
  auditDate: string;
  auditorName: string;
  status: AuditStatus;
  mainResponseOptions?: ComplianceStatus[];
  hazardDescription?: string;
  whoMightBeHarmed?: string;
  existingControls?: string;
  additionalControlsRequired?: string;
  initialLikelihood?: number;
  initialSeverity?: number;
  initialRiskScore?: number;
  residualLikelihood?: number;
  residualSeverity?: number;
  residualRiskScore?: number;
  auditFindingsComments?: string;
  risksIdentified?: string;
  overallRiskLevel?: string;
  sections: AuditSection[];
  findings: Finding[];
  actions: Action[];
  // Narrative sections
  introduction?: string;
  scope?: string;
  methodology?: string;
  legislation?: string;
  disclaimer?: string;
  conclusion?: string;
  // Legacy / extra
  generalComments?: string;
  siteLogoUrl?: string;
  siteLogoPath?: string;
  siteLogoDataUrl?: string;
  siteBuildingPhotoUrl?: string;
  siteBuildingPhotoPath?: string;
  siteBuildingPhotoDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditStats {
  completed: number;
  drafts: number;
  totalNonCompliant: number;
  totalFindings: number;
  highRiskActions: number;
}

export interface TemplateSubsection {
  id: string;
  title: string;
  active: boolean;
  displayOrder: number;
}

export interface TemplateSection {
  id: string;
  title: string;
  active: boolean;
  displayOrder: number;
  notes?: string;
  subsections: TemplateSubsection[];
  items: ChecklistItem[];
}

export interface RiskScaleValue {
  value: number;
  label: string;
}

export interface RiskBandSetting {
  band: RiskBand;
  min: number;
  max: number;
}

export interface RiskPrioritySetting {
  band: RiskBand;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
}

export interface TemplateRiskSettings {
  likelihood: RiskScaleValue[];
  severity: RiskScaleValue[];
  bands: RiskBandSetting[];
  priorityMapping: RiskPrioritySetting[];
}

export interface TemplateReportDefaults {
  introduction: string;
  scope: string;
  methodology: string;
  legislation: string;
  disclaimer: string;
  conclusion: string;
}

export interface AuditTemplate {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  version: number;
  mainResponseOptions: ComplianceStatus[];
  sections: TemplateSection[];
  riskSettings: TemplateRiskSettings;
  reportDefaults: TemplateReportDefaults;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}
