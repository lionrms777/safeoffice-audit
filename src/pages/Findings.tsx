import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAudits } from '../AuditContext';
import { Audit, Finding, RiskBand } from '../types';
import { normalizeRiskData, getRiskBandFromScore } from '../lib/risk';
import { ChevronRight, Calendar, User, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { RISK_LEVELS, getPriorityFromRiskBand } from '../constants';

// ── Risk Matrix colour helpers ───────────────────────────────────────────────
const LIKELIHOODS = [5, 4, 3, 2, 1]; // top-to-bottom display order
const SEVERITIES  = [1, 2, 3, 4, 5]; // left-to-right

function cellBand(l: number, s: number): RiskBand {
  return getRiskBandFromScore(l * s);
}

function cellBg(l: number, s: number): string {
  const band = cellBand(l, s);
  if (band === 'Very High') return 'bg-red-700 text-white';
  if (band === 'High')      return 'bg-orange-400 text-white';
  if (band === 'Moderate')  return 'bg-amber-300 text-slate-900';
  return 'bg-green-400 text-slate-900';
}

function bandBadge(band: RiskBand): string {
  if (band === 'Very High') return 'bg-red-700 text-white';
  if (band === 'High')      return 'bg-orange-400 text-white';
  if (band === 'Moderate')  return 'bg-amber-400 text-slate-900';
  return 'bg-green-500 text-white';
}

// ── Inline 5×5 risk matrix picker ───────────────────────────────────────────
function RiskMatrixPicker({
  likelihood,
  severity,
  onChange,
}: {
  likelihood: number;
  severity: number;
  onChange: (l: number, s: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] border-collapse w-full">
        <thead>
          <tr>
            <th className="text-left text-slate-500 font-medium pr-2 pb-1 w-16 whitespace-nowrap">L \ S</th>
            {SEVERITIES.map(s => (
              <th key={s} className="text-center font-medium text-slate-500 pb-1 min-w-[36px]">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LIKELIHOODS.map(l => (
            <tr key={l}>
              <td className="text-slate-500 font-medium pr-2 py-0.5">{l}</td>
              {SEVERITIES.map(s => {
                const selected = l === likelihood && s === severity;
                return (
                  <td key={s} className="py-0.5 px-0.5">
                    <button
                      type="button"
                      onClick={() => onChange(l, s)}
                      className={cn(
                        'w-full rounded font-bold transition-all py-1',
                        cellBg(l, s),
                        selected
                          ? 'ring-2 ring-offset-1 ring-slate-800 scale-105 z-10 relative shadow-md'
                          : 'opacity-70 hover:opacity-100',
                      )}
                    >
                      {l * s}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-1">L = Likelihood · S = Severity · Click a cell to set risk score</p>
    </div>
  );
}
export default function Findings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAudit, saveAudit } = useAudits();
  const [audit, setAudit] = useState<Audit | null>(null);

  useEffect(() => {
    if (id) {
      const found = getAudit(id);
      if (found) {
        setAudit(found);
      } else {
        navigate('/');
      }
    }
  }, [id, getAudit, navigate]);

  const updateFinding = useCallback((findingId: string, updates: Partial<Finding>) => {
    if (!audit) return;

    const updatedFindings = audit.findings.map(f => {
      if (f.id === findingId) {
        const updated = { ...f, ...updates };
        // Recalculate risk whenever L, S, or the manual override changes
        if (
          updates.likelihood !== undefined ||
          updates.severity !== undefined ||
          'finalRiskRating' in updates
        ) {
          const risk = normalizeRiskData(
            updated.likelihood,
            updated.severity,
            updated.finalRiskRating ?? undefined,
          );
          updated.calculatedRiskScore = risk.calculatedRiskScore;
          updated.calculatedRiskBand  = risk.calculatedRiskBand;
          updated.finalRiskRating     = risk.finalRiskRating;
          updated.riskScore           = risk.riskScore;
          updated.riskBand            = risk.riskBand;
          updated.priority            = getPriorityFromRiskBand(risk.riskBand);
        }
        return updated;
      }
      return f;
    });

    // Also update linked actions
    const updatedActions = audit.actions.map(a => {
      if (a.findingId === findingId) {
        const finding = updatedFindings.find(f => f.id === findingId)!;
        return {
          ...a,
          findingTitle: finding.title,
          actionRequired: finding.recommendedAction,
          priority: finding.priority,
          likelihood: finding.likelihood,
          severity: finding.severity,
          riskScore: finding.riskScore,
          riskBand: finding.riskBand,
          finalRiskRating: finding.finalRiskRating,
        };
      }
      return a;
    });

    const updatedAudit = { ...audit, findings: updatedFindings, actions: updatedActions, updatedAt: new Date().toISOString() };
    setAudit(updatedAudit);
    saveAudit(updatedAudit);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit]);

  if (!audit) return null;

  const getRiskColor = (band: RiskBand) => {
    switch (band) {
      case 'Very High': return 'bg-red-700 text-white';
      case 'High': return 'bg-red-600 text-white';
      case 'Moderate': return 'bg-amber-500 text-white';
      case 'Low': return 'bg-green-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  return (
    <Layout title="Audit Findings" showBack>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Findings List ({audit.findings.length})</h2>
          <button 
            onClick={() => navigate(`/audit/${audit.id}/checklist`)}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Back to Checklist
          </button>
        </div>

        {audit.findings.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Info className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500">No findings generated yet. Mark items as "Negative" in the checklist to create findings.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {audit.findings.map((finding) => (
              <div key={finding.id} className="card overflow-hidden border-l-4 border-l-red-500">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{finding.sectionTitle}</span>
                  <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", getRiskColor(finding.riskBand))}>
                    {finding.riskBand} Risk ({finding.riskScore})
                  </div>
                </div>
                
                <div className="p-5 space-y-6">
                  <div>
                    <label className="label">Finding Title</label>
                    <input 
                      type="text" 
                      className="input font-semibold"
                      value={finding.title}
                      onChange={(e) => updateFinding(finding.id, { title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label">Observation / Details</label>
                    <textarea 
                      className="input min-h-[80px] text-sm"
                      value={finding.observation}
                      onChange={(e) => updateFinding(finding.id, { observation: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label">Recommended Action</label>
                    <textarea 
                      className="input min-h-[80px] text-sm"
                      value={finding.recommendedAction}
                      onChange={(e) => updateFinding(finding.id, { recommendedAction: e.target.value })}
                    />
                  </div>

                  {/* ── Risk Matrix ─────────────────────────────────────── */}
                  <div className="space-y-2">
                    <label className="label">Risk Matrix — click a cell to set Likelihood × Severity</label>
                    <RiskMatrixPicker
                      likelihood={finding.likelihood}
                      severity={finding.severity}
                      onChange={(l, s) => updateFinding(finding.id, { likelihood: l, severity: s })}
                    />
                  </div>

                  {/* ── L / S dropdowns + live score ───────────────────── */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Likelihood</label>
                      <select
                        className="input text-sm"
                        value={finding.likelihood}
                        onChange={(e) => updateFinding(finding.id, { likelihood: parseInt(e.target.value) })}
                      >
                        {RISK_LEVELS.LIKELIHOOD.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Severity</label>
                      <select
                        className="input text-sm"
                        value={finding.severity}
                        onChange={(e) => updateFinding(finding.id, { severity: parseInt(e.target.value) })}
                      >
                        {RISK_LEVELS.SEVERITY.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Calculated Score</label>
                      <div className={cn('input text-sm font-bold text-center', bandBadge(finding.calculatedRiskBand ?? finding.riskBand))}>
                        {finding.likelihood * finding.severity} — {finding.calculatedRiskBand ?? finding.riskBand}
                      </div>
                    </div>
                  </div>

                  {/* ── Final risk override + priority + status ─────────── */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Final Risk Rating</label>
                      <select
                        className={cn('input text-sm font-semibold', bandBadge(finding.riskBand))}
                        value={finding.finalRiskRating ?? ''}
                        onChange={(e) => {
                          const val = e.target.value as RiskBand | '';
                          updateFinding(finding.id, {
                            finalRiskRating: val === '' ? undefined : val,
                          });
                        }}
                      >
                        <option value="">Auto ({finding.calculatedRiskBand ?? finding.riskBand})</option>
                        {(['Low', 'Moderate', 'High', 'Very High'] as RiskBand[]).map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Priority</label>
                      <div className="input text-sm bg-slate-50 flex items-center font-semibold">
                        {finding.priority}
                      </div>
                    </div>
                    <div>
                      <label className="label">Status</label>
                      <select
                        className="input text-sm"
                        value={finding.status}
                        onChange={(e) => updateFinding(finding.id, { status: e.target.value as any })}
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="label">Target Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="date" 
                          className="input pl-10 text-sm"
                          value={finding.targetDate || ''}
                          onChange={(e) => updateFinding(finding.id, { targetDate: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <label className="label">Responsible</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          className="input pl-10 text-sm"
                          placeholder="Name..."
                          value={finding.responsiblePerson || ''}
                          onChange={(e) => updateFinding(finding.id, { responsiblePerson: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-6 pb-12">
          <button 
            onClick={() => navigate(`/audit/${audit.id}/summary`)}
            className="btn btn-primary w-full py-4 text-lg gap-2"
          >
            Review Action Plan
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </Layout>
  );
}
