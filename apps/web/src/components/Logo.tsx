import { PRODUCT_NAME } from "../lib/brand";

/** Знак: кольцо с разрывом (канал роста) и точка внутри (сигнал). Цвет берётся из текста. */
export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor">
      <path d="M22.2 9.8A9 9 0 1 0 25 16" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <LogoMark />
      {PRODUCT_NAME}
    </span>
  );
}
