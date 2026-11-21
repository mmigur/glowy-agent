import { ArrowRight, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { ActiveCheck } from "../../components/ActiveCheck";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { PRICING, PRODUCT_NAME } from "../../lib/brand";
import { fill, useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { ProductDemo } from "./ProductDemo";
import { StepScene, type StepKind } from "./StepScenes";

const container = "mx-auto w-full max-w-[1080px] px-6";
const STEP_ORDER: StepKind[] = ["connect", "setup", "research", "publish"];

export function LandingPage() {
  const { m } = useI18n();
  const copy = m.landing;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className={cn(container, "flex h-14 items-center justify-between gap-3")}>
          <Link to="/" aria-label={`${PRODUCT_NAME} home`}>
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#demo" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground lg:block">
              {copy.demo}
            </a>
            <a href="#how" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground lg:block">
              {copy.how}
            </a>
            <a href="#limits" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground xl:block">
              {copy.limits}
            </a>
            <a href="#pricing" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground xl:block">
              {copy.pricing}
            </a>
            <LanguageSwitch />
            <ThemeToggle />
            <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {copy.signIn}
            </Link>
            <Link to="/login" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
              {copy.getStarted}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={cn(container, "grid gap-14 pb-24 pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-28")}>
          <div className="fade-up">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{copy.eyebrow}</p>
            <h1 className="mt-4 text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
              {copy.heroTitle}
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-7 text-muted-foreground">{copy.heroBody}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/login" className={buttonVariants({ size: "lg" })}>
                {copy.getStarted} <ArrowRight className="size-4" />
              </Link>
              <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
                {copy.how}
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {fill(copy.trial, { days: PRICING.trialDays, price: PRICING.proPriceUsd })}
            </p>
          </div>

          <div className="fade-up [animation-delay:120ms]">
            <ProductDemo />
          </div>
        </section>

        <section id="how" className="border-t border-border">
          <div className={cn(container, "py-24")}>
            <h2 className="text-3xl font-semibold tracking-tight">{copy.howTitle}</h2>
            <ol className="mt-12 grid gap-4 md:grid-cols-2">
              {STEP_ORDER.map((id, i) => {
                const step = copy.steps[id];
                return (
                  <li key={id} className="fade-up overflow-hidden rounded-lg border border-border bg-background" style={{ animationDelay: `${i * 90}ms` }}>
                    <StepScene kind={id} />
                    <div className="p-6">
                      <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                      <h3 className="mt-4 text-base font-medium">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section id="limits" className="border-t border-border">
          <div className={cn(container, "grid gap-12 py-24 lg:grid-cols-[1fr_1.4fr]")}>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">{copy.limitsTitle}</h2>
              <p className="mt-3 max-w-sm text-muted-foreground">{copy.limitsIntro}</p>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {copy.limitItems.map((item) => (
                <li key={item} className="flex gap-3 py-4 text-[15px] leading-6">
                  <Minus className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" className="border-t border-border">
          <div className={cn(container, "py-24")}>
            <h2 className="text-3xl font-semibold tracking-tight">{copy.pricingTitle}</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-[1fr_1.4fr]">
              <div className="bg-background p-8">
                <h3 className="text-sm font-medium">{copy.trialName}</h3>
                <p className="mt-4 text-4xl font-semibold tracking-tight">$0</p>
                <p className="mt-1 text-sm text-muted-foreground">{fill(copy.trialPriceNote, { days: PRICING.trialDays })}</p>
                <p className="mt-6 text-sm leading-6 text-muted-foreground">{copy.trialBody}</p>
              </div>
              <div className="bg-background p-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{copy.pro}</h3>
                  <Badge tone="solid">{copy.afterTrial}</Badge>
                </div>
                <p className="mt-4 text-4xl font-semibold tracking-tight">
                  ${PRICING.proPriceUsd}
                  <span className="text-base font-normal text-muted-foreground"> {copy.perMonth}</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {copy.proFeatures.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <ActiveCheck className="mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link to="/login" className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full sm:w-auto")}>
                  {copy.getStarted}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={cn(container, "flex h-16 items-center justify-between gap-4 text-sm text-muted-foreground")}>
          <span>{PRODUCT_NAME}</span>
          <a href="https://t.me/miguroff" target="_blank" rel="noreferrer" className="hover:text-foreground">
            {copy.founder}
          </a>
          <span className="text-right">{copy.footerApi}</span>
        </div>
      </footer>
    </div>
  );
}
