import Layout from '../components/Layout';
import { useAudits } from '../AuditContext';
import { Plus, ClipboardCheck, FileText, AlertTriangle, ChevronRight, Shield, ListChecks, Clock, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const { audits, stats } = useAudits();
  const navigate = useNavigate();
  const { user } = useAuth();

  const recentAudits = [...audits]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const draftAudits = audits.filter(a => a.status === 'draft');

  return (
    <Layout title="Dashboard" onLogout={onLogout}>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-8 shadow-xl">
          <img
            src="/brand-hero.svg"
            alt="Safety is the Key Ltd banner"
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">Welcome back, {user?.email?.split('@')[0] || 'Auditor'}</h2>
            <p className="text-slate-400 text-sm max-w-[260px]">
              {stats.drafts > 0
                ? `You have ${stats.drafts} draft audit${stats.drafts !== 1 ? 's' : ''} in progress.`
                : 'All audits are complete. Start a new inspection.'}
            </p>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-slate-400/10 rounded-full mr-10 mb-10 blur-2xl" />
          <Shield className="absolute right-8 top-1/2 -translate-y-1/2 w-24 h-24 text-white/5 rotate-12" />
        </div>

        {/* Stats Grid — 2×3 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Total Audits', value: audits.length, icon: <ClipboardCheck className="w-5 h-5" />, bg: 'bg-blue-50', fg: 'text-blue-600' },
            { label: 'Completed', value: stats.completed, icon: <ClipboardCheck className="w-5 h-5" />, bg: 'bg-green-50', fg: 'text-green-600' },
            { label: 'Drafts', value: stats.drafts, icon: <FileText className="w-5 h-5" />, bg: 'bg-amber-50', fg: 'text-amber-600' },
            { label: 'Issues Found', value: stats.totalNonCompliant, icon: <AlertTriangle className="w-5 h-5" />, bg: 'bg-orange-50', fg: 'text-orange-600' },
            { label: 'Total Findings', value: stats.totalFindings, icon: <ListChecks className="w-5 h-5" />, bg: 'bg-red-50', fg: 'text-red-600' },
            { label: 'High Risk Actions', value: stats.highRiskActions, icon: <AlertTriangle className="w-5 h-5" />, bg: 'bg-red-50', fg: 'text-red-700' },
          ].map((stat) => (
            <div key={stat.label} className="card p-4 flex flex-col items-center justify-center text-center gap-1">
              <div className={cn('w-9 h-9 rounded-full flex items-center justify-center mb-1', stat.bg, stat.fg)}>
                {stat.icon}
              </div>
              <span className="text-2xl font-bold text-slate-900">{stat.value}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            onClick={() => navigate('/audit/new')}
            className="btn btn-primary py-4 gap-2 text-base shadow-lg shadow-slate-900/20"
          >
            <Plus className="w-5 h-5" />
            Start New Audit
          </button>
          {draftAudits.length > 0 && (
            <button
              onClick={() => navigate(`/audit/${draftAudits[0].id}/checklist`)}
              className="btn btn-secondary py-4 gap-2 text-base"
            >
              <Clock className="w-5 h-5" />
              Continue Draft
            </button>
          )}
          <button
            onClick={() => navigate('/history')}
            className={cn('btn btn-secondary py-4 gap-2 text-base', draftAudits.length === 0 && 'md:col-span-2')}
          >
            <History className="w-5 h-5" />
            View History
          </button>
        </div>

        {/* Recent Audits */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Audits</h2>
            <button
              onClick={() => navigate('/history')}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {recentAudits.length > 0 ? (
              recentAudits.map((audit, index) => (
                <motion.div
                  key={audit.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => navigate(audit.status === 'draft' ? `/audit/${audit.id}/checklist` : `/audit/${audit.id}`)}
                  className="card p-4 flex items-center justify-between hover:border-slate-400 cursor-pointer transition-all active:bg-slate-50"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-900 truncate">{audit.clientName}</span>
                    <span className="text-sm text-slate-500 truncate">{audit.siteName} • {formatDate(audit.auditDate)}</span>
                    {audit.findings?.length > 0 && (
                      <span className="text-xs text-red-500 font-medium mt-0.5">{audit.findings.length} finding{audit.findings.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md",
                      audit.status === 'completed' ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                    )}>
                      {audit.status}
                    </span>
                    <ChevronRight className="w-5 h-5 text-slate-300" />
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                <p className="text-slate-400">No audits found. Start your first inspection!</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
