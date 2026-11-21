import { cn } from "../lib/utils";
import { useI18n, type Locale } from "../lib/i18n";

const OPTIONS: Locale[] = ["en", "ru"];

export function LanguageSwitch({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { locale, setLocale, m } = useI18n();

  return (
    <div role="radiogroup" aria-label={m.lang.label} className="inline-flex rounded-md border border-border-strong p-0.5">
      {OPTIONS.map((code) => {
        const selected = locale === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setLocale(code)}
            className={cn(
              "rounded px-2.5 text-sm transition-colors",
              variant === "full" ? "h-8 px-4" : "h-7 text-xs font-medium",
              selected ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {variant === "full" ? m.lang[code] : code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
