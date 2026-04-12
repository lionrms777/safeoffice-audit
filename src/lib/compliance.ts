import { Audit } from '../types';

export interface GeneralComplianceMetrics {
  avgRiskScore: number | null;
  riskHealthScore: number;
  generalComplianceScore: number;
  generalComplianceRating: 'Strong' | 'Good' | 'Needs Improvement' | 'Poor';
}

const getComplianceRating = (score: number): GeneralComplianceMetrics['generalComplianceRating'] => {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Needs Improvement';
  return 'Poor';
};

export const calculateGeneralComplianceMetrics = (
  audit: Audit,
  complianceRate: number,
): GeneralComplianceMetrics => {
  const riskScores = (audit.findings || [])
    .map((finding) => finding.riskScore)
    .filter((score) => Number.isFinite(score) && score > 0);

  const avgRiskScore = riskScores.length > 0
    ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length
    : null;

  const riskHealthScore = avgRiskScore !== null
    ? Math.round(Math.max(0, 100 - ((avgRiskScore / 25) * 100)))
    : complianceRate;

  const generalComplianceScore = Math.round((complianceRate * 0.65) + (riskHealthScore * 0.35));

  return {
    avgRiskScore,
    riskHealthScore,
    generalComplianceScore,
    generalComplianceRating: getComplianceRating(generalComplianceScore),
  };
};
