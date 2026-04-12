import { AuditSection, RiskBand } from './types';
import { getRiskBandFromScore } from './lib/risk';

export const POSITIVE_RESPONSE_OPTIONS = [
  'Satisfactory condition',
  'No issues identified',
  'Compliant with requirements',
  'Adequate provision in place',
] as const;

export const NEGATIVE_RESPONSE_OPTIONS = [
  'Obstruction present',
  'Poor housekeeping',
  'Missing equipment',
  'Inadequate signage',
  'Maintenance issue',
  'Unsafe condition identified',
] as const;

const ITEM_SPECIFIC_POSITIVE_OPTIONS: Record<string, string[]> = {
  hk1: ['Escape routes clear and unobstructed', 'No obstructions identified', 'Suitable control measures observed'],
  hk2: ['Good housekeeping standard', 'Satisfactory condition', 'No issues identified'],
  hk3: ['Waste management satisfactory', 'Bins emptied routinely', 'Adequate provision in place'],
  fs1: ['Equipment/serviceable condition satisfactory', 'Extinguishers present and in date', 'Adequate provision in place'],
  fs2: ['Call points visible and accessible', 'No obstructions identified', 'Satisfactory condition'],
  fs3: ['Signage clear and compliant', 'Adequate signage in place', 'No issues identified'],
  el1: ['No trailing cable hazards observed', 'Suitable control measures observed', 'Good housekeeping standard'],
  el2: ['PAT records up to date', 'Equipment/serviceable condition satisfactory', 'Compliant with requirements'],
  el3: ['Sockets and switches in good condition', 'No defects identified', 'Satisfactory condition'],
  fa1: ['First aid box available and stocked', 'Adequate provision in place', 'No issues identified'],
  fa2: ['First aider details clearly displayed', 'Signage and information adequate', 'Compliant with requirements'],
  st1: ['Floors free from trip hazards', 'Good housekeeping standard', 'Suitable control measures observed'],
  st2: ['Walkways and stairs adequately lit', 'No issues identified', 'Satisfactory condition'],
  ds1: ['Workstation setup is ergonomic', 'Suitable control measures observed', 'Satisfactory condition'],
  ds2: ['Chair condition and adjustment satisfactory', 'Equipment/serviceable condition satisfactory', 'No issues identified'],
  wf1: ['Welfare facilities clean and functional', 'Good housekeeping standard', 'Adequate provision in place'],
  wf2: ['Drinking water provision adequate', 'Compliant with requirements', 'No issues identified'],
  ea1: ['Emergency contacts clearly displayed', 'Adequate signage in place', 'Compliant with requirements'],
  ea2: ['Assembly point clearly identified', 'Signage clear and compliant', 'No issues identified'],
  mh1: ['Storage arrangement is suitable', 'Suitable control measures observed', 'No issues identified'],
  mh2: ['Manual handling training records current', 'Compliant with requirements', 'Adequate provision in place'],
  ot1: ['No additional safety concerns identified', 'Satisfactory condition', 'No issues identified'],
};

const ITEM_SPECIFIC_NEGATIVE_OPTIONS: Record<string, string[]> = {
  hk1: ['Obstruction present', 'Unsafe condition identified', 'Inadequate signage'],
  hk2: ['Poor housekeeping', 'Unsafe condition identified', 'Maintenance issue'],
  hk3: ['Poor housekeeping', 'Missing equipment', 'Maintenance issue'],
  fs1: ['Missing equipment', 'Maintenance issue', 'Unsafe condition identified'],
  fs2: ['Obstruction present', 'Inadequate signage', 'Unsafe condition identified'],
  fs3: ['Inadequate signage', 'Missing equipment', 'Unsafe condition identified'],
  el1: ['Obstruction present', 'Unsafe condition identified', 'Poor housekeeping'],
  el2: ['Maintenance issue', 'Missing equipment', 'Unsafe condition identified'],
  el3: ['Maintenance issue', 'Unsafe condition identified', 'Missing equipment'],
  fa1: ['Missing equipment', 'Maintenance issue', 'Unsafe condition identified'],
  fa2: ['Inadequate signage', 'Missing equipment', 'Unsafe condition identified'],
  st1: ['Obstruction present', 'Maintenance issue', 'Unsafe condition identified'],
  st2: ['Inadequate signage', 'Maintenance issue', 'Unsafe condition identified'],
  ds1: ['Unsafe condition identified', 'Poor housekeeping', 'Maintenance issue'],
  ds2: ['Maintenance issue', 'Missing equipment', 'Unsafe condition identified'],
  wf1: ['Poor housekeeping', 'Maintenance issue', 'Unsafe condition identified'],
  wf2: ['Missing equipment', 'Inadequate signage', 'Unsafe condition identified'],
  ea1: ['Inadequate signage', 'Missing equipment', 'Unsafe condition identified'],
  ea2: ['Inadequate signage', 'Unsafe condition identified', 'Obstruction present'],
  mh1: ['Unsafe condition identified', 'Poor housekeeping', 'Obstruction present'],
  mh2: ['Maintenance issue', 'Missing equipment', 'Unsafe condition identified'],
  ot1: ['Unsafe condition identified', 'Maintenance issue', 'Poor housekeeping'],
};

export const getPositiveResponseOptionsForItem = (itemId: string): readonly string[] => {
  const specific = ITEM_SPECIFIC_POSITIVE_OPTIONS[itemId];
  return specific && specific.length > 0 ? specific : POSITIVE_RESPONSE_OPTIONS;
};

export const getNegativeResponseOptionsForItem = (itemId: string): readonly string[] => {
  const specific = ITEM_SPECIFIC_NEGATIVE_OPTIONS[itemId];
  return specific && specific.length > 0 ? specific : NEGATIVE_RESPONSE_OPTIONS;
};

export const RISK_LEVELS = {
  LIKELIHOOD: [
    { value: 1, label: '1 Rare' },
    { value: 2, label: '2 Unlikely' },
    { value: 3, label: '3 Possible' },
    { value: 4, label: '4 Likely' },
    { value: 5, label: '5 Almost Certain' },
  ],
  SEVERITY: [
    { value: 1, label: '1 Negligible' },
    { value: 2, label: '2 Minor' },
    { value: 3, label: '3 Moderate' },
    { value: 4, label: '4 Major' },
    { value: 5, label: '5 Catastrophic' },
  ]
};

export const getRiskBand = (score: number): RiskBand => {
  return getRiskBandFromScore(score);
};

export const getPriorityFromRiskBand = (band: RiskBand): 'Low' | 'Medium' | 'High' | 'Urgent' => {
  switch (band) {
    case 'Very High':
      return 'Urgent';
    case 'High':
      return 'High';
    case 'Moderate':
      return 'Medium';
    default:
      return 'Low';
  }
};

export const getRecommendedActionFromNegativeOption = (option?: string) => {
  switch (option) {
    case 'Obstruction present':
      return 'Remove obstruction immediately and maintain clear access routes.';
    case 'Poor housekeeping':
      return 'Implement housekeeping controls and assign routine checks.';
    case 'Missing equipment':
      return 'Provide missing safety equipment and verify availability.';
    case 'Inadequate signage':
      return 'Install or replace safety signage to meet compliance requirements.';
    case 'Maintenance issue':
      return 'Raise a maintenance request and verify rectification completion.';
    case 'Unsafe condition identified':
      return 'Apply immediate control measures and escalate for urgent remediation.';
    default:
      return 'Remedial action required to address this non-compliance.';
  }
};

export const DEFAULT_NARRATIVE = {
  introduction:
    'This health and safety audit and risk assessment has been undertaken to assess workplace conditions and control measures in line with UK health and safety legal duties.',
  scope:
    'This audit covers areas accessible at the time of inspection and considers workplace arrangements, physical conditions, and visible risks requiring control.',
  methodology:
    'The audit was completed by visual inspection of the premises together with review of any information available at the time of inspection.',
  legislation:
    'Health and Safety at Work etc. Act 1974\nManagement of Health and Safety at Work Regulations 1999\nWorkplace (Health, Safety and Welfare) Regulations 1992\nRegulatory Reform (Fire Safety) Order 2005 (where fire risk applies)\nManual Handling Operations Regulations 1992 (where relevant)\nProvision and Use of Work Equipment Regulations 1998 (where relevant)',
  disclaimer:
    'This report is based on conditions observed at the time of inspection. Hidden defects, inaccessible areas, and matters outside the scope of the inspection may not have been identified.',
  conclusion:
    'In general, the premises presented a mixed level of compliance at the time of inspection. The findings and action plan within this report should be addressed in order of priority.',
};

export const CHECKLIST_TEMPLATES: AuditSection[] = [
  {
    id: 'housekeeping',
    title: 'General Housekeeping',
    items: [
      { id: 'hk1', question: 'Are escape routes and fire exits clear of obstructions?', status: 'na', comment: '' },
      { id: 'hk2', question: 'Is the office generally clean and tidy?', status: 'na', comment: '' },
      { id: 'hk3', question: 'Are waste bins emptied regularly?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'fire',
    title: 'Fire Safety',
    items: [
      { id: 'fs1', question: 'Are fire extinguishers present and in date?', status: 'na', comment: '' },
      { id: 'fs2', question: 'Are fire alarm call points visible and unobstructed?', status: 'na', comment: '' },
      { id: 'fs3', question: 'Is fire safety signage clearly displayed?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'electrical',
    title: 'Electrical Safety',
    items: [
      { id: 'el1', question: 'Are there any trailing cables causing trip hazards?', status: 'na', comment: '' },
      { id: 'el2', question: 'Is portable appliance testing (PAT) up to date?', status: 'na', comment: '' },
      { id: 'el3', question: 'Are sockets and switches in good condition?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'firstaid',
    title: 'First Aid',
    items: [
      { id: 'fa1', question: 'Is the first aid box available and fully stocked?', status: 'na', comment: '' },
      { id: 'fa2', question: 'Are first aider names clearly displayed?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'slips',
    title: 'Slips, Trips and Falls',
    items: [
      { id: 'st1', question: 'Are floors free from trip hazards (e.g. loose tiles, wet spots)?', status: 'na', comment: '' },
      { id: 'st2', question: 'Are stairs and walkways well lit?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'dse',
    title: 'Display Screen Equipment / Workstations',
    items: [
      { id: 'ds1', question: 'Are workstations ergonomically set up?', status: 'na', comment: '' },
      { id: 'ds2', question: 'Are chairs adjustable and in good condition?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'welfare',
    title: 'Welfare Facilities',
    items: [
      { id: 'wf1', question: 'Are toilets and washrooms clean and functional?', status: 'na', comment: '' },
      { id: 'wf2', question: 'Is drinking water available?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'emergency',
    title: 'Emergency Arrangements',
    items: [
      { id: 'ea1', question: 'Are emergency contact numbers displayed?', status: 'na', comment: '' },
      { id: 'ea2', question: 'Is the assembly point clearly identified?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'manual',
    title: 'Manual Handling',
    items: [
      { id: 'mh1', question: 'Are heavy items stored at waist height?', status: 'na', comment: '' },
      { id: 'mh2', question: 'Is manual handling training up to date?', status: 'na', comment: '' },
    ],
  },
  {
    id: 'other',
    title: 'Other Observations',
    items: [
      { id: 'ot1', question: 'Are there any other safety concerns observed?', status: 'na', comment: '' },
    ],
  },
];
