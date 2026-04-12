import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAudits } from '../AuditContext';
import { Search, ChevronRight, Calendar, User, MapPin, Trash2, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate, cn } from '../lib/utils';
import { motion } from 'motion/react';

const OLD_DRAFT_DAYS = 30;

type SortBy = 'date' | 'status' | 'client';

type ConfirmState = {
  isOpen: boolean;
  title: string;
  message: string;
  tone: 'danger' | 'warning';
  action: 'delete' | 'reset';
  auditIds: string[];
};

const initialConfirmState: ConfirmState = {
  isOpen: false,
  title: '',
  message: '',
  tone: 'warning',
  action: 'delete',
  auditIds: [],
};

export default function History() {
  const { audits, deleteAudit, resetDraftAudit } = useAudits();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'completed' | 'draft'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirmState);
  const [busy, setBusy] = useState(false);

  const oldDraftIds = useMemo(() => {
    const threshold = Date.now() - OLD_DRAFT_DAYS * 24 * 60 * 60 * 1000;
    return audits
      .filter((audit) => audit.status === 'draft' && new Date(audit.updatedAt || audit.createdAt || audit.auditDate).getTime() < threshold)
      .map((audit) => audit.id);
  }, [audits]);

  const filteredAudits = useMemo(() => {
    const rows = audits.filter((audit) => {
      const matchesSearch =
        audit.clientName.toLowerCase().includes(search.toLowerCase()) ||
        audit.siteName.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || audit.status === filter;
      return matchesSearch && matchesFilter;
    });

    rows.sort((a, b) => {
      if (sortBy === 'client') return a.clientName.localeCompare(b.clientName);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return new Date(b.updatedAt || b.auditDate).getTime() - new Date(a.updatedAt || a.auditDate).getTime();
    });

    return rows;
  }, [audits, filter, search, sortBy]);

  const allVisibleIds = filteredAudits.map((audit) => audit.id);
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));

  const openDeleteConfirm = (auditIds: string[]) => {
    const plural = auditIds.length > 1;
    setConfirm({
      isOpen: true,
      title: plural ? 'Delete selected audits?' : 'Delete audit?',
      message: plural
        ? 'Are you sure you want to delete the selected audits? This action cannot be undone.'
        : 'Are you sure you want to delete this audit? This action cannot be undone.',
      tone: 'danger',
      action: 'delete',
      auditIds,
    });
  };

  const openResetConfirm = (auditId: string) => {
    setConfirm({
      isOpen: true,
      title: 'Reset draft audit?',
      message: 'Reset this audit? All responses and findings will be removed.',
      tone: 'warning',
      action: 'reset',
      auditIds: [auditId],
    });
  };

  const handleConfirm = async () => {
    if (confirm.auditIds.length === 0) return;
    setBusy(true);

    try {
      if (confirm.action === 'delete') {
        await Promise.all(confirm.auditIds.map((id) => deleteAudit(id)));
        setSelectedIds((prev) => prev.filter((id) => !confirm.auditIds.includes(id)));
      } else {
        await Promise.all(confirm.auditIds.map((id) => resetDraftAudit(id)));
      }
    } catch (error) {
      console.error('Audit operation failed:', error);
      alert('Unable to complete the requested action. Please try again.');
    } finally {
      setBusy(false);
      setConfirm(initialConfirmState);
    }
  };

  const toggleSelect = (auditId: string) => {
    setSelectedIds((prev) => (prev.includes(auditId) ? prev.filter((id) => id !== auditId) : [...prev, auditId]));
  };

  const toggleSelectVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...allVisibleIds])]);
    }
  };

  return (
    <Layout title="Audit History" showBack>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              className="input pl-12"
              placeholder="Search by client or site..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl">
              {(['all', 'draft', 'completed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all',
                    filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="input py-2 text-sm"
            >
              <option value="date">Sort: Date</option>
              <option value="status">Sort: Status</option>
              <option value="client">Sort: Client</option>
            </select>

            <button
              type="button"
              onClick={toggleSelectVisible}
              className="btn btn-secondary py-2 text-sm"
            >
              {allVisibleSelected ? 'Clear Visible Selection' : 'Select Visible'}
            </button>
          </div>
        </div>

        {oldDraftIds.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-amber-900">
              {oldDraftIds.length} old draft{oldDraftIds.length !== 1 ? 's are' : ' is'} older than {OLD_DRAFT_DAYS} days.
            </p>
            <button
              type="button"
              onClick={() => openDeleteConfirm(oldDraftIds)}
              className="btn bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 text-xs"
            >
              Cleanup Old Drafts
            </button>
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-700">{selectedIds.length} selected</p>
            <button
              type="button"
              onClick={() => openDeleteConfirm(selectedIds)}
              className="btn bg-red-700 hover:bg-red-800 text-white px-3 py-2 text-xs gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </button>
          </div>
        )}

        <div className="space-y-4">
          {filteredAudits.length > 0 ? (
            filteredAudits.map((audit, index) => (
              <motion.div
                key={audit.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card p-5 transition-all"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                    checked={selectedIds.includes(audit.id)}
                    onChange={() => toggleSelect(audit.id)}
                    aria-label={`Select ${audit.clientName}`}
                  />

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => navigate(audit.status === 'draft' ? `/audit/${audit.id}/checklist` : `/audit/${audit.id}`)}
                      className="w-full text-left"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-slate-900 truncate">{audit.clientName}</h3>
                          <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">{audit.siteName}</span>
                          </div>
                        </div>
                        <span className={cn(
                          'text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md',
                          audit.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                        )}>
                          {audit.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>{formatDate(audit.auditDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <User className="w-3 h-3 shrink-0" />
                          <span className="truncate">{audit.auditorName}</span>
                        </div>
                        {audit.departmentArea && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{audit.departmentArea}</span>
                          </div>
                        )}
                        {audit.responsiblePerson && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <User className="w-3 h-3 shrink-0" />
                            <span className="truncate">{audit.responsiblePerson}</span>
                          </div>
                        )}
                        {audit.reviewDate && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Review: {formatDate(audit.reviewDate)}</span>
                          </div>
                        )}
                        {(audit.initialRiskScore !== undefined && audit.residualRiskScore !== undefined) && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">Risk:</span>
                            <span>{audit.initialRiskScore} → {audit.residualRiskScore}</span>
                          </div>
                        )}
                      </div>
                    </button>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {audit.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => navigate(`/audit/${audit.id}/checklist`)}
                          className="btn btn-secondary px-3 py-2 text-xs"
                        >
                          Continue Draft
                        </button>
                      )}

                      {audit.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => openResetConfirm(audit.id)}
                          className="btn bg-amber-100 text-amber-900 hover:bg-amber-200 px-3 py-2 text-xs gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset Draft
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openDeleteConfirm([audit.id])}
                        className="btn bg-red-100 text-red-900 hover:bg-red-200 px-3 py-2 text-xs gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Audit
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate(audit.status === 'draft' ? `/audit/${audit.id}/checklist` : `/audit/${audit.id}`)}
                        className="btn btn-secondary px-3 py-2 text-xs gap-1"
                      >
                        Open
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-400">No audits matching your criteria.</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirm.isOpen}
        title={confirm.title}
        message={confirm.message}
        tone={confirm.tone}
        confirmLabel={confirm.action === 'delete' ? 'Delete' : 'Reset'}
        onCancel={() => !busy && setConfirm(initialConfirmState)}
        onConfirm={handleConfirm}
        busy={busy}
      />
    </Layout>
  );
}
