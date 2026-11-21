import { cn } from "../lib/utils";

/** Зелёный круг с белой галочкой и мягкой подсветкой. Только для активного / выполненного состояния. */
export function ActiveCheck({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      className={cn("active-check", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
        <path d="M3.8 8.2 6.6 11l5.6-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
