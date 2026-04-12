import { RiskBand } from '../types';
import { cn } from '../lib/utils';
import { getRiskBandClass, getRiskBandFromScore } from '../lib/risk';

interface RiskMatrixProps {
  selectedLikelihood: number;
  selectedSeverity: number;
  compact?: boolean;
}

export default function RiskMatrix({ selectedLikelihood, selectedSeverity, compact = false }: RiskMatrixProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className={cn('w-full border-collapse text-xs', compact ? 'min-w-[420px]' : 'min-w-[520px]')}>
        <thead className="bg-slate-100 text-slate-700 uppercase tracking-wide">
          <tr>
            <th className="px-2 py-2 border border-slate-200 text-left">Likelihood \\ Severity</th>
            {[1, 2, 3, 4, 5].map((severity) => (
              <th key={severity} className="px-2 py-2 border border-slate-200 text-center font-semibold">
                {severity}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[5, 4, 3, 2, 1].map((likelihood) => (
            <tr key={likelihood}>
              <th className="px-2 py-2 border border-slate-200 bg-slate-50 text-left font-semibold">{likelihood}</th>
              {[1, 2, 3, 4, 5].map((severity) => {
                const score = likelihood * severity;
                const band = getRiskBandFromScore(score);
                const selected = likelihood === selectedLikelihood && severity === selectedSeverity;
                return (
                  <td key={`${likelihood}-${severity}`} className="p-1 border border-slate-200">
                    <div
                      className={cn(
                        'rounded px-1.5 py-1 text-center border text-[11px] font-semibold',
                        getRiskBandClass(band),
                        selected && 'ring-2 ring-slate-900 ring-offset-1'
                      )}
                    >
                      {score} ({band})
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
