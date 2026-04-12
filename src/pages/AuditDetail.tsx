import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAudits } from '../AuditContext';
import { Audit, RiskBand } from '../types';
import { DEFAULT_NARRATIVE } from '../constants';
import {
  CheckCircle, Download, User, MapPin, Calendar,
  ListChecks, Table as TableIcon, Loader2,
  BookOpen, Target, FlaskConical, Scale, AlertCircle, MessageSquare, Trash2, RotateCcw,
} from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import { generateAuditReport } from '../lib/reportGenerator';
import { calculateGeneralComplianceMetrics } from '../lib/compliance';

function riskBadge(band: RiskBand) {
  const cls: Record<RiskBand, string> = {
    'Very High': 'bg-red-600 text-white',
    'High': 'bg-orange-500 text-white',
    'Moderate': 'bg-amber-400 text-slate-900',
    'Low': 'bg-green-600 text-white',
  };
  return cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide', cls[band]);
}

function priorityBadge(priority: string) {
  const cls: Record<string, string> = {
    Urgent: 'bg-red-600 text-white', Critical: 'bg-red-700 text-white',
    High: 'bg-orange-500 text-white', Medium: 'bg-amber-400 text-slate-900', Low: 'bg-green-600 text-white',
  };
  return cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase', cls[priority] || 'bg-slate-100 text-slate-700');
}

function statusBadge(status: string) {
  const cls: Record<string, string> = {
    Open: 'bg-red-50 text-red-700', 'In Progress': 'bg-blue-50 text-blue-700', Closed: 'bg-green-50 text-green-700',
  };
  return cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', cls[status] || 'bg-slate-100 text-slate-600');
}

function NarrativeBlock({ icon, title, content, defaultContent }: { icon: React.ReactNode; title: string; content: string; defaultContent: string }) {
  const text = (content || defaultContent).trim();
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">{icon}</div>
        <h4 className="font-semibold text-slate-700 text-sm">{title}</h4>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line pl-8">{text}</p>
    </div>
  );
}

export default function AuditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAudit, deleteAudit, resetDraftAudit } = useAudits();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean; action: 'delete' | 'reset' }>({ isOpen: false, action: 'delete' });
  const [isActionBusy, setIsActionBusy] = useState(false);

  useEffect(() => {
    if (id) {
      const found = getAudit(id);
      if (found) setAudit(found);
      else navigate('/');
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

  const handleDownloadReport = async () => {
    setIsGenerating(true);
    try {
      const diagnostics = await generateAuditReport(audit);
      const embedded = diagnostics?.embeddedPhotoCount ?? 0;
      const referenced = diagnostics?.referencedPhotoCount ?? 0;
      alert(`Word report generated successfully. Photos embedded: ${embedded}/${referenced}`);
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate Word report. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Layout title="Audit Report" showBack>
      <div className="space-y-6 pb-12">

        {/* Status banner */}
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{audit.clientName}</h2>
            <p className="text-slate-400 text-sm mt-1">{audit.siteName} • {formatDate(audit.auditDate)}</p>
            <p className="text-slate-400 text-xs mt-0.5">Auditor: {audit.auditorName}</p>
            <p className="text-slate-300 text-xs mt-2">
              General Compliance Score: <span className="font-bold text-white">{generalCompliance.generalComplianceScore}%</span>
              {' '}({generalCompliance.generalComplianceRating})
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <CheckCircle className="w-10 h-10 text-green-400" />
            <span className={cn(
              'text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border',
              audit.status === 'completed'
                ? 'bg-green-500/20 text-green-300 border-green-500/30'
                : 'bg-amber-500/20 text-amber-200 border-amber-500/30'
            )}>
              {audit.status}
            </span>
            <span className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border',
              generalScoreStyle.bg,
              generalScoreStyle.color,
              'border-white/20'
            )}>
              {generalCompliance.generalComplianceRating}
            </span>
          </div>
        </div>

        {/* 1. Site details */}
        <div className="card p-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">1. Client &amp; Site Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Client</p>
                <p className="font-semibold text-sm">{audit.clientName}</p>
                <p className="text-xs text-slate-500">Auditor: {audit.auditorName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Site</p>
                <p className="font-semibold text-sm">{audit.siteName}</p>
                <p className="text-xs text-slate-500">{audit.siteAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Audit Date</p>
                <p className="font-semibold text-sm">{formatDate(audit.auditDate)}</p>
              </div>
            </div>
          </div>
          {(audit.siteLogoUrl || audit.siteBuildingPhotoUrl) && (
            <div className="mt-4 flex gap-3 flex-wrap">
              {audit.siteLogoUrl && (
                <div className="space-y-1">
                  <img src={audit.siteLogoUrl} alt="Client logo" className="h-16 rounded-lg object-contain border border-slate-100" />
                  <div className="flex gap-2 text-[11px]">
                    <a href={audit.siteLogoUrl} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900">View</a>
                    <a href={audit.siteLogoUrl} target="_blank" rel="noopener noreferrer" download className="text-slate-600 hover:text-slate-900">Download</a>
                  </div>
                </div>
              )}
              {audit.siteBuildingPhotoUrl && (
                <div className="space-y-1">
                  <img src={audit.siteBuildingPhotoUrl} alt="Site photo" className="h-32 rounded-lg object-cover border border-slate-100" />
                  <div className="flex gap-2 text-[11px]">
                    <a href={audit.siteBuildingPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900">View</a>
                    <a href={audit.siteBuildingPhotoUrl} target="_blank" rel="noopener noreferrer" download className="text-slate-600 hover:text-slate-900">Download</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Workplace Risk Profile</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Assessment Reference</p>
              <p className="font-semibold text-slate-800">{audit.assessmentReference || 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Responsible Person</p>
              <p className="font-semibold text-slate-800">{audit.responsiblePerson || 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Department / Area</p>
              <p className="font-semibold text-slate-800">{audit.departmentArea || 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Location / Layout</p>
              <p className="font-semibold text-slate-800">{audit.locationLayout || 'N/A'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Task / Activity / Process</p>
              <p className="font-semibold text-slate-800">{audit.taskActivityProcess || 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Review Date</p>
              <p className="font-semibold text-slate-800">{audit.reviewDate ? formatDate(audit.reviewDate) : 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Initial / Residual Risk</p>
              <p className="font-semibold text-slate-800">{audit.initialRiskScore || 0} / {audit.residualRiskScore || 0}</p>
            </div>
          </div>
        </div>

        {/* 2–6. Narrative */}
        <div className="card p-5 space-y-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">2–6. Report Narrative</h3>
          <NarrativeBlock icon={<BookOpen className="w-3.5 h-3.5" />} title="2. Introduction" content={audit.introduction || ''} defaultContent={DEFAULT_NARRATIVE.introduction} />
          <div className="border-t border-slate-100" />
          <NarrativeBlock icon={<Target className="w-3.5 h-3.5" />} title="3. Scope" content={audit.scope || ''} defaultContent={DEFAULT_NARRATIVE.scope} />
          <div className="border-t border-slate-100" />
          <NarrativeBlock icon={<FlaskConical className="w-3.5 h-3.5" />} title="4. Methodology" content={audit.methodology || ''} defaultContent={DEFAULT_NARRATIVE.methodology} />
          <div className="border-t border-slate-100" />
          <NarrativeBlock icon={<Scale className="w-3.5 h-3.5" />} title="5. Applicable Legislation" content={audit.legislation || ''} defaultContent={DEFAULT_NARRATIVE.legislation} />
          <div className="border-t border-slate-100" />
          <NarrativeBlock icon={<AlertCircle className="w-3.5 h-3.5" />} title="6. Disclaimer" content={audit.disclaimer || ''} defaultContent={DEFAULT_NARRATIVE.disclaimer} />
        </div>

        {/* 7. Compliance summary */}
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">7. Compliance Summary</h3>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 8. Findings */}
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> 8. Findings ({audit.findings?.length || 0})
          </h3>
          <div className="space-y-3">
            {(audit.findings || []).map((finding, idx) => (
              <div key={finding.id} className="card p-4 border-l-4 border-l-red-500">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{finding.sectionTitle}</span>
                    <h4 className="font-semibold text-slate-900">F{idx + 1}. {finding.title}</h4>
                  </div>
                  <span className={riskBadge(finding.riskBand)}>{finding.riskBand} ({finding.riskScore})</span>
                </div>
                <p className="text-sm text-slate-600 mb-3">{finding.observation}</p>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Recommended Action</p>
                  <p className="text-sm text-slate-700">{finding.recommendedAction}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                  <span className={priorityBadge(finding.priority)}>{finding.priority}</span>
                  <span className={statusBadge(finding.status)}>{finding.status}</span>
                  <span>L: {finding.likelihood} · S: {finding.severity} · Score: {finding.riskScore}</span>
                  {finding.responsiblePerson && <span>👤 {finding.responsiblePerson}</span>}
                  {finding.targetDate && <span>📅 {formatDate(finding.targetDate)}</span>}
                </div>
                {(() => {
                  const section = audit.sections.find(s => s.id === finding.sectionId);
                  const item = section?.items.find(i => i.id === finding.itemId);
                  return item?.photoUrl ? (
                    <div className="mt-3">
                      <div className="w-40 h-32 rounded-lg overflow-hidden border border-slate-200">
                        <img src={item.photoUrl} alt="Evidence" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex gap-2 text-[11px] mt-1">
                        <a href={item.photoUrl} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900">View</a>
                        <a href={item.photoUrl} target="_blank" rel="noopener noreferrer" download className="text-slate-600 hover:text-slate-900">Download</a>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            ))}
            {(!audit.findings || audit.findings.length === 0) && (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No findings recorded.</p>
              </div>
            )}
          </div>
        </section>

        {/* 9. Action Plan */}
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <TableIcon className="w-4 h-4" /> 9. Action Plan
          </h3>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-left border-collapse min-w-[820px] text-sm">
              <thead className="bg-slate-800 text-white text-[10px] uppercase tracking-wider font-bold">
                <tr>
                  {['Ref','Linked Finding','Action Required','Priority','L','S','Score','Responsible','Target Date','Status'].map(h => (
                    <th key={h} className="px-3 py-3 border-b border-slate-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-xs">
                {(audit.actions || []).map((action, idx) => (
                  <tr key={action.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 border-b border-slate-100 font-mono font-bold">A{idx + 1}</td>
                    <td className="px-3 py-3 border-b border-slate-100 max-w-[120px] truncate">{action.findingTitle || '-'}</td>
                    <td className="px-3 py-3 border-b border-slate-100 font-medium max-w-[200px]">{action.actionRequired}</td>
                    <td className="px-3 py-3 border-b border-slate-100"><span className={priorityBadge(action.priority)}>{action.priority}</span></td>
                    <td className="px-3 py-3 border-b border-slate-100 text-center font-semibold">{action.likelihood}</td>
                    <td className="px-3 py-3 border-b border-slate-100 text-center font-semibold">{action.severity}</td>
                    <td className="px-3 py-3 border-b border-slate-100 text-center font-bold">{action.riskScore}</td>
                    <td className="px-3 py-3 border-b border-slate-100">{action.responsiblePerson || '-'}</td>
                    <td className="px-3 py-3 border-b border-slate-100 whitespace-nowrap">{action.targetDate ? formatDate(action.targetDate) : '-'}</td>
                    <td className="px-3 py-3 border-b border-slate-100"><span className={statusBadge(action.status)}>{action.status}</span></td>
                  </tr>
                ))}
                {(!audit.actions || audit.actions.length === 0) && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400 italic">No actions required.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 10. Conclusion */}
        {(audit.conclusion || audit.generalComments) && (
          <section className="card p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> 10. Conclusion
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {audit.conclusion || audit.generalComments}
            </p>
          </section>
        )}

        {/* Download */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleDownloadReport}
            disabled={isGenerating}
            className="btn btn-primary flex-1 gap-2 shadow-lg shadow-slate-900/20"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            {isGenerating ? 'Generating Word Report...' : 'Generate Word Report'}
          </button>

          {audit.status === 'draft' && (
            <button
              type="button"
              onClick={() => setConfirmState({ isOpen: true, action: 'reset' })}
              className="btn bg-amber-100 text-amber-900 hover:bg-amber-200 gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Draft
            </button>
          )}

          <button
            type="button"
            onClick={() => setConfirmState({ isOpen: true, action: 'delete' })}
            className="btn bg-red-100 text-red-900 hover:bg-red-200 gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Audit
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.action === 'delete' ? 'Delete audit?' : 'Reset draft audit?'}
        message={
          confirmState.action === 'delete'
            ? 'Are you sure you want to delete this audit? This action cannot be undone.'
            : 'Reset this audit? All responses and findings will be removed.'
        }
        confirmLabel={confirmState.action === 'delete' ? 'Delete' : 'Reset'}
        tone={confirmState.action === 'delete' ? 'danger' : 'warning'}
        busy={isActionBusy}
        onCancel={() => !isActionBusy && setConfirmState({ isOpen: false, action: 'delete' })}
        onConfirm={async () => {
          setIsActionBusy(true);
          try {
            if (confirmState.action === 'delete') {
              await deleteAudit(audit.id);
              navigate('/history');
              return;
            }

            const didReset = await resetDraftAudit(audit.id);
            if (didReset) {
              const refreshed = getAudit(audit.id);
              if (refreshed) setAudit(refreshed);
            }
          } catch (error) {
            console.error('Failed to run audit action:', error);
            alert('Unable to complete the requested action. Please try again.');
          } finally {
            setIsActionBusy(false);
            setConfirmState({ isOpen: false, action: 'delete' });
          }
        }}
      />
    </Layout>
  );
}
