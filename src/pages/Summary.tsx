import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAudits } from '../AuditContext';
import { Audit } from '../types';
import { DEFAULT_NARRATIVE } from '../constants';
import {
  CheckCircle, AlertTriangle, Send, Edit3, User, MapPin, Calendar,
  BookOpen, Target, Scale, AlertCircle, ListChecks, Table as TableIcon,
  MessageSquare, FileText,
} from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import { calculateGeneralComplianceMetrics } from '../lib/compliance';
import { FindingsRegisterTable, ActionPlanTable } from '../components/ReportTables';

interface NarrativeBlockProps {
  icon: React.ReactNode;
  title: string;
  content: string;
  defaultContent: string;
}
function NarrativeBlock({ icon, title, content, defaultContent }: NarrativeBlockProps) {
  const text = (content || defaultContent).trim();
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-500">{icon}</div>
        <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

export default function Summary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAudit, saveAudit } = useAudits();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [risksIdentified, setRisksIdentified] = useState('');
  const [overallRiskLevel, setOverallRiskLevel] = useState('');

  useEffect(() => {
    if (id) {
      const found = getAudit(id);
      if (found) {
        setAudit(found);
        setConclusion(found.conclusion || found.generalComments || DEFAULT_NARRATIVE.conclusion);
        setRisksIdentified(found.risksIdentified || '');
        setOverallRiskLevel(found.overallRiskLevel || '');
      } else {
        navigate('/');
      }
    }
  }, [id, getAudit, navigate]);

  if (!audit) return null;

  const totalItems = audit.sections.reduce((acc, s) => acc + s.items.length, 0);
  const compliantCount = audit.sections.reduce((acc, s) => acc + s.items.filter(i => i.status === 'positive').length, 0);
  const nonCompliantCount = audit.sections.reduce((acc, s) => acc + s.items.filter(i => i.status === 'negative').length, 0);
  const naCount = audit.sections.reduce((acc, s) => acc + s.items.filter(i => i.status === 'na').length, 0);
  const inScope = totalItems - naCount;
  const complianceRate = inScope > 0 ? Math.round((compliantCount / inScope) * 100) : 100;
  const generalCompliance = calculateGeneralComplianceMetrics(audit, complianceRate);
  const generalScoreStyle = generalCompliance.generalComplianceScore >= 85
    ? { color: 'text-green-700', bg: 'bg-green-50 border-green-100' }
    : generalCompliance.generalComplianceScore >= 70
      ? { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100' }
      : generalCompliance.generalComplianceScore >= 55
        ? { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-100' }
        : { color: 'text-red-700', bg: 'bg-red-50 border-red-100' };

  const handleSubmit = async () => {
    const updatedAudit: Audit = {
      ...audit,
      status: 'completed',
      conclusion,
      generalComments: conclusion,
      risksIdentified,
      overallRiskLevel,
      updatedAt: new Date().toISOString(),
    };
    await saveAudit(updatedAudit);
    navigate(`/audit/${audit.id}`);
  };

  return (
    <Layout title="Audit Summary" showBack>
      <div className="space-y-6">

        {/* ── Header card ── */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-slate-900">Pre-Submission Review</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/audit/${audit.id}/narrative`)}
                className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Edit Narrative
              </button>
              <button
                onClick={() => navigate(`/audit/${audit.id}/checklist`)}
                className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Checklist
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Client &amp; Auditor</p>
                <p className="font-semibold text-sm">{audit.clientName}</p>
                <p className="text-xs text-slate-500">{audit.auditorName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Location</p>
                <p className="font-semibold text-sm">{audit.siteName}</p>
                <p className="text-xs text-slate-500 truncate">{audit.siteAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Audit Date</p>
                <p className="font-semibold text-sm">{formatDate(audit.auditDate)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Workplace Risk Profile ── */}
        {(audit.departmentArea || audit.locationLayout || audit.taskActivityProcess || audit.responsiblePerson || audit.reviewDate || audit.initialRiskScore || audit.residualRiskScore) && (
          <section className="card p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Workplace Risk Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {audit.assessmentReference && (
                <div className="md:col-span-2">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Assessment Reference</p>
                  <p className="font-semibold text-slate-800">{audit.assessmentReference}</p>
                </div>
              )}
              {audit.departmentArea && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Department / Area</p>
                  <p className="font-semibold text-slate-800">{audit.departmentArea}</p>
                </div>
              )}
              {audit.locationLayout && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Location / Layout</p>
                  <p className="font-semibold text-slate-800">{audit.locationLayout}</p>
                </div>
              )}
              {audit.taskActivityProcess && (
                <div className="md:col-span-2">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Task / Activity / Process</p>
                  <p className="font-semibold text-slate-800">{audit.taskActivityProcess}</p>
                </div>
              )}
              {audit.responsiblePerson && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Responsible Person</p>
                  <p className="font-semibold text-slate-800">{audit.responsiblePerson}</p>
                </div>
              )}
              {audit.reviewDate && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Review Date</p>
                  <p className="font-semibold text-slate-800">{formatDate(audit.reviewDate)}</p>
                </div>
              )}
              {(audit.initialRiskScore !== undefined || audit.residualRiskScore !== undefined) && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Initial / Residual Risk Score</p>
                  <p className="font-semibold text-slate-800">{audit.initialRiskScore ?? 'N/A'} → {audit.residualRiskScore ?? 'N/A'}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Compliance summary ── */}
        <section>
          <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Compliance Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Positive', value: compliantCount, color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
              { label: 'Negative', value: nonCompliantCount, color: 'text-red-700', bg: 'bg-red-50 border-red-100' },
              { label: 'N / A', value: naCount, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
              { label: 'Compliance', value: `${complianceRate}%`, color: complianceRate >= 80 ? 'text-green-700' : 'text-red-700', bg: complianceRate >= 80 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100' },
              { label: 'General Score', value: `${generalCompliance.generalComplianceScore}%`, color: generalScoreStyle.color, bg: generalScoreStyle.bg },
            ].map(s => (
              <div key={s.label} className={cn('card p-3 text-center border', s.bg)}>
                <span className={cn('text-xl font-bold', s.color)}>{s.value}</span>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mb-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            General Compliance Rating: <span className="font-bold text-slate-800">{generalCompliance.generalComplianceRating}</span>
            {' '}| Average Risk Score: <span className="font-semibold">{generalCompliance.avgRiskScore !== null ? generalCompliance.avgRiskScore.toFixed(1) : 'N/A'}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-sm min-w-[500px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3 border-b border-slate-200">Section</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center text-green-700">Positive</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center text-red-700">Negative</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center">N/A</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center">Issues</th>
                </tr>
              </thead>
              <tbody>
                {audit.sections.map(section => {
                  const pos = section.items.filter(i => i.status === 'positive').length;
                  const neg = section.items.filter(i => i.status === 'negative').length;
                  const na = section.items.filter(i => i.status === 'na').length;
                  return (
                    <tr key={section.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 border-b border-slate-100 font-medium">{section.title}</td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center text-green-700 font-semibold">{pos}</td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center text-red-700 font-semibold">{neg}</td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center text-slate-400">{na}</td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center">
                        {neg > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />{neg}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" />Clear
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Executive Summary Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label">Overall Risk Level</label>
              <input
                className="input"
                placeholder="e.g. Low, Moderate, High, Very High"
                value={overallRiskLevel}
                onChange={(e) => setOverallRiskLevel(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="label">Risks Identified</label>
              <textarea
                className="input min-h-[110px] text-sm leading-relaxed"
                placeholder="Summarise the principal risks identified during the audit..."
                value={risksIdentified}
                onChange={(e) => setRisksIdentified(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ── Narrative preview ── */}
        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Report Narrative
          </h3>
          <NarrativeBlock icon={<BookOpen className="w-3.5 h-3.5" />} title="Introduction" content={audit.introduction || ''} defaultContent={DEFAULT_NARRATIVE.introduction} />
          <NarrativeBlock icon={<Target className="w-3.5 h-3.5" />} title="Scope" content={audit.scope || ''} defaultContent={DEFAULT_NARRATIVE.scope} />
          <NarrativeBlock icon={<Scale className="w-3.5 h-3.5" />} title="Applicable Legislation" content={audit.legislation || ''} defaultContent={DEFAULT_NARRATIVE.legislation} />
          <NarrativeBlock icon={<AlertCircle className="w-3.5 h-3.5" />} title="Disclaimer" content={audit.disclaimer || ''} defaultContent={DEFAULT_NARRATIVE.disclaimer} />
        </section>

        {/* ── Findings ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> Findings Register
            </h3>
            <button
              onClick={() => navigate(`/audit/${audit.id}/findings`)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1 border border-slate-200 rounded-lg px-3 py-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit Findings
            </button>
          </div>
          <p className="text-sm text-slate-500">Each issue is recorded once here with evidence, inspector notes, risk rating, and a short ref to the linked action.</p>
          <FindingsRegisterTable audit={audit} />
        </section>

        {/* ── Action Plan ── */}
        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TableIcon className="w-4 h-4" /> Action Plan
          </h3>
          <p className="text-sm text-slate-500">Actions are linked back to the findings register by ref and only show what must be done next.</p>
          <ActionPlanTable audit={audit} />
        </section>

        {/* ── Conclusion ── */}
        <section className="card p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Conclusion / Final Comments
          </h3>
          <textarea
            className="input min-h-[120px] py-3 text-sm leading-relaxed"
            placeholder="Add a final summary and closing observations…"
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
          />
        </section>

        {/* ── Submit button ── */}
        <div className="pt-2 pb-12">
          <button
            onClick={handleSubmit}
            className="btn btn-primary w-full py-5 text-lg shadow-xl shadow-slate-900/20 gap-2"
          >
            <Send className="w-6 h-6" />
            Submit Final Audit
          </button>
          <p className="text-center text-slate-400 text-xs mt-3">
            Submitting will mark this audit as completed and lock it for editing.
          </p>
        </div>
      </div>
    </Layout>
  );
}
