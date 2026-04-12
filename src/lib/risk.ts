import { RiskBand } from '../types';

export const RISK_BAND_ORDER: RiskBand[] = ['Low', 'Moderate', 'High', 'Very High'];

export function getRiskBandFromScore(score: number): RiskBand {
  if (score >= 16) return 'Very High';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Moderate';
  return 'Low';
}

export function normalizeRiskData(likelihood: number, severity: number, finalRiskRating?: RiskBand) {
  const calculatedRiskScore = likelihood * severity;
  const calculatedRiskBand = getRiskBandFromScore(calculatedRiskScore);
  const effectiveFinalRisk = clampFinalRiskRating(calculatedRiskBand, finalRiskRating);

  return {
    likelihood,
    severity,
    calculatedRiskScore,
    calculatedRiskBand,
    finalRiskRating: effectiveFinalRisk,
    riskScore: calculatedRiskScore,
    riskBand: effectiveFinalRisk,
  };
}

export function clampFinalRiskRating(calculatedBand: RiskBand, selected?: RiskBand): RiskBand {
  if (!selected) return calculatedBand;
  const calculatedIdx = RISK_BAND_ORDER.indexOf(calculatedBand);
  const selectedIdx = RISK_BAND_ORDER.indexOf(selected);
  return selectedIdx < calculatedIdx ? calculatedBand : selected;
}

export function getRiskBandClass(band: RiskBand) {
  switch (band) {
    case 'Very High':
      return 'bg-red-700 text-white border-red-800';
    case 'High':
      return 'bg-red-100 text-red-900 border-red-200';
    case 'Moderate':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'Low':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function getRiskBandFillHex(band: RiskBand) {
  switch (band) {
    case 'Very High':
      return 'B91C1C';
    case 'High':
      return 'FEE2E2';
    case 'Moderate':
      return 'FEF3C7';
    case 'Low':
      return 'DCFCE7';
    default:
      return 'E2E8F0';
  }
}
