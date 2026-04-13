import { Audit, RiskBand } from '../types';
import { cn, formatDate } from '../lib/utils';
import { buildReportActionRows, buildReportFindingRows, ItemPhotoPart } from '../lib/reportTables';

function riskBadge(band: RiskBand) {
  const cls: Record<RiskBand, string> = {
    'Very High': 'bg-red-600 text-white',
    High: 'bg-orange-500 text-white',
    Moderate: 'bg-amber-300 text-slate-900',
    Low: 'bg-green-600 text-white',
  };

  return cn(
    'inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold tracking-wide whitespace-nowrap',
    cls[band],
  );
}

function priorityBadge(priority: string) {
  const cls: Record<string, string> = {
    Critical: 'bg-red-700 text-white',
    Urgent: 'bg-red-600 text-white',
    High: 'bg-orange-500 text-white',
    Medium: 'bg-amber-300 text-slate-900',
    Low: 'bg-green-600 text-white',
  };

  return cn(
    'inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold uppercase whitespace-nowrap',
    cls[priority] || 'bg-slate-100 text-slate-700',
  );
}

function statusBadge(status: string) {
  const cls: Record<string, string> = {
    Open: 'bg-red-50 text-red-700 border border-red-100',
    'In Progress': 'bg-blue-50 text-blue-700 border border-blue-100',
    Closed: 'bg-green-50 text-green-700 border border-green-100',
  };

  return cn(
    'inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold uppercase whitespace-nowrap',
    cls[status] || 'bg-slate-100 text-slate-600 border border-slate-200',
  );
}

function PhotosCell({ photos, hasPhotoRef }: { photos: ItemPhotoPart[]; hasPhotoRef: boolean }) {
  const visible = photos.filter((p) => p.photoUrl || p.photoDataUrl);

  if (visible.length === 0) {
    return <span className="text-xs text-slate-400">{hasPhotoRef ? 'Image unavailable' : 'No photo'}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {visible.map((photo, idx) => {
        const src = photo.photoUrl || photo.photoDataUrl;
        return (
          <a key={idx} href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <img
              src={src}
              alt={`Evidence ${idx + 1}`}
              className="h-20 w-20 rounded-lg border border-slate-200 object-cover shadow-sm hover:opacity-80 transition-opacity"
              referrerPolicy="no-referrer"
            />
          </a>
        );
      })}
    </div>
  );
}

export function FindingsRegisterTable({ audit }: { audit: Audit }) {
  const findingRows = buildReportFindingRows(audit);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
        <thead className="bg-slate-900 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
          <tr>
            <th className="w-20 px-5 py-4 text-center whitespace-nowrap">Ref</th>
            <th className="w-52 px-5 py-4 whitespace-nowrap">Section</th>
            <th className="min-w-[280px] px-5 py-4">Finding / Observation</th>
            <th className="min-w-[220px] px-5 py-4">Inspector Notes</th>
            <th className="w-36 px-5 py-4 text-center whitespace-nowrap">Risk Rating</th>
            <th className="w-36 px-5 py-4 text-center whitespace-nowrap">Photo</th>
          </tr>
        </thead>
        <tbody className="align-top text-[13px] text-slate-700">
          {findingRows.map((row) => {
            const observationText = row.observation.trim();
            const titleText = row.title.trim();
            const hasDistinctObservation = observationText.length > 0 && observationText !== titleText;

            return (
              <tr key={row.findingId} className="border-b border-slate-100 last:border-b-0">
                <td className="px-5 py-5 text-center font-mono text-xs font-bold text-slate-900">{row.refCode}</td>
                <td className="px-5 py-5 font-semibold text-slate-900">{row.sectionTitle}</td>
                <td className="px-5 py-5">
                  <div className="space-y-2">
                    <p className="font-semibold leading-6 text-slate-900">{titleText || observationText || '-'}</p>
                    {hasDistinctObservation && (
                      <p className="leading-6 text-slate-600">{observationText}</p>
                    )}
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{row.actionReference}</p>
                  </div>
                </td>
                <td className="px-5 py-5 leading-6 text-slate-600">{row.inspectorNotes || '—'}</td>
                <td className="px-5 py-5 text-center">
                  <span className={riskBadge(row.riskBand)}>{row.riskBand} ({row.riskScore})</span>
                </td>
                <td className="px-5 py-5 text-center">
                  <PhotosCell photos={row.photos} hasPhotoRef={row.hasPhotoRef} />
                </td>
              </tr>
            );
          })}
          {findingRows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-sm italic text-slate-400">No findings recorded.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ActionPlanTable({ audit }: { audit: Audit }) {
  const findingRows = buildReportFindingRows(audit);
  const actionRows = buildReportActionRows(audit, findingRows);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-slate-900 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
          <tr>
            <th className="w-20 px-5 py-4 text-center whitespace-nowrap">Ref</th>
            <th className="min-w-[320px] px-5 py-4">Action Required</th>
            <th className="w-36 px-5 py-4 text-center whitespace-nowrap">Priority</th>
            <th className="w-44 px-5 py-4 text-center whitespace-nowrap">Responsible Person</th>
            <th className="w-40 px-5 py-4 text-center whitespace-nowrap">Target Date</th>
            <th className="w-36 px-5 py-4 text-center whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody className="align-top text-[13px] text-slate-700">
          {actionRows.map((row) => (
            <tr key={row.actionId} className="border-b border-slate-100 last:border-b-0">
              <td className="px-5 py-5 text-center font-mono text-xs font-bold text-slate-900">{row.refCode}</td>
              <td className="px-5 py-5">
                <div className="space-y-2">
                  <p className="font-semibold leading-6 text-slate-900">{row.actionRequired}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Linked finding: {row.refCode}</p>
                </div>
              </td>
              <td className="px-5 py-5 text-center"><span className={priorityBadge(row.priority)}>{row.priority}</span></td>
              <td className="px-5 py-5 text-center text-slate-600">{row.responsiblePerson || '—'}</td>
              <td className="px-5 py-5 text-center text-slate-600 whitespace-nowrap">{row.targetDate ? formatDate(row.targetDate) : '—'}</td>
              <td className="px-5 py-5 text-center"><span className={statusBadge(row.status)}>{row.status}</span></td>
            </tr>
          ))}
          {actionRows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-sm italic text-slate-400">No actions required.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
