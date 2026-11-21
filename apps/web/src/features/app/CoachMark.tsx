import { useLayoutEffect, useState } from "react";

/** Подсказка рядом с элементом [data-tour]. Сам элемент остаётся кликабельным. */
export function CoachMark({ target, title, body }: { target: string; title: string; body: string }) {
  const [box, setBox] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    const update = () => setBox(el.getBoundingClientRect());
    update();
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const main = document.querySelector("main");
    main?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      main?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [target]);

  if (!box) return null;
  const below = box.bottom + 150 < window.innerHeight;
  const top = below ? box.bottom + 12 : Math.max(12, box.top - 120);
  const left = Math.min(Math.max(12, box.left), window.innerWidth - 300);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div
        className="absolute rounded-lg ring-2 ring-foreground"
        style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }}
      />
      <div className="pointer-events-auto absolute w-[280px] rounded-lg border border-border-strong bg-background p-3 shadow-lg" style={{ top, left }}>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
