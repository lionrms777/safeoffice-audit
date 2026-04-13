import { cn } from '../lib/utils';

export default function Logo({ className, iconOnly = false }: { className?: string, iconOnly?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img src="/logo.svg" alt="Safety is the Key Ltd" className="h-10 w-auto max-w-[60px] rounded-xl shadow-lg" />
      {!iconOnly && (
        <span className="font-bold text-xl tracking-tight text-slate-900">Safety is the Key Ltd</span>
      )}
    </div>
  );
}
