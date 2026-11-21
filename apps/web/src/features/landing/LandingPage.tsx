import { ArrowRight, Check, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { PRICING, PRODUCT_NAME } from "../../lib/brand";
import { cn } from "../../lib/utils";

const container = "mx-auto w-full max-w-[1080px] px-6";

const STEPS = [
  {
    title: "Connect",
    body: "Link your X and Threads accounts through the official authorization flow. Tokens stay on the server.",
  },
  {
    title: "Set up in minutes",
    body: "Seven short questions: what you do, what you write about, your tone, your goals. Skip any of them.",
  },
  {
    title: "The agent researches",
    body: "Each day it studies which posts outperform in your niche, and why: hooks, structure, length, timing.",
  },
  {
    title: "You review, it publishes",
    body: "Drafts arrive with a reason and a suggested time. Approve, edit or reject. Nothing goes out without your rules.",
  },
] as const;

const LIMITS = [
  "No auto-replies, auto-likes or auto-follows. They break X's automation rules.",
  "No scraping. The agent works only through official APIs, so some numbers are simply not available.",
  "Metrics the platform does not provide are shown as unavailable, never estimated.",
  "No promise of follower growth. Each pattern shows how much data stands behind it.",
] as const;

const PRO_FEATURES = [
  "Daily niche research on X and Threads",
  "Drafts in your voice, with the reasoning",
  "Scheduling and a publishing calendar",
  "Analytics for your own posts",
  "A strategy that adapts to your results",
] as const;

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className={cn(container, "flex h-14 items-center justify-between")}>
          <Link to="/" aria-label={`${PRODUCT_NAME} home`}>
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#how" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:block">
              How it works
            </a>
            <a href="#limits" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:block">
              Limits
            </a>
            <a href="#pricing" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:block">
              Pricing
            </a>
            <ThemeToggle />
            <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link to="/login" className={buttonVariants({ size: "sm" })}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={cn(container, "grid gap-14 pb-24 pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-28")}>
          <div className="fade-up">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">For founders on X and Threads</p>
            <h1 className="mt-4 text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
              Stay active online without living there.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-7 text-muted-foreground">
              Ten minutes of setup. Then an agent studies what works in your niche every day, drafts posts in your
              voice, and keeps your calendar full. You stay in control of what gets published.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/login" className={buttonVariants({ size: "lg" })}>
                Get started <ArrowRight className="size-4" />
              </Link>
              <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
                How it works
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {PRICING.trialDays} days free, then ${PRICING.proPriceUsd}/month.
            </p>
          </div>

          <figure className="fade-up [animation-delay:120ms]" aria-label="Example of an agent draft">
            <div className="rounded-lg border border-border-strong bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-xs text-muted-foreground">Draft · Threads</span>
                <Badge tone="muted">Example</Badge>
              </div>
              <div className="px-4 py-4">
                <p className="text-[15px] leading-6">
                  We spent six months building features nobody asked for. The fix took one afternoon: we called five
                  users. Here is the three-question script we used.
                </p>
              </div>
              <dl className="divide-y divide-border border-t border-border text-sm">
                <Row label="Pattern" value="Mistake, then lesson, then script" />
                <Row label="Why this" value="Short first-person lessons with a concrete takeaway beat the niche median this week." />
                <Row label="Suggested time" value="Tue 09:30, your timezone" />
                <Row label="Confidence" value={<Badge tone="outline">Medium · 14 posts</Badge>} />
              </dl>
              <div className="flex gap-2 border-t border-border px-4 py-3">
                <span className={cn(buttonVariants({ size: "sm" }), "pointer-events-none")}>Schedule</span>
                <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none")}>Edit</span>
                <span className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "pointer-events-none")}>Reject</span>
              </div>
            </div>
            <figcaption className="mt-3 text-xs text-muted-foreground">
              An illustration of the output format, not real data.
            </figcaption>
          </figure>
        </section>

        <section id="how" className="border-t border-border">
          <div className={cn(container, "py-24")}>
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="bg-background p-6">
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  <h3 className="mt-6 text-base font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="limits" className="border-t border-border">
          <div className={cn(container, "grid gap-12 py-24 lg:grid-cols-[1fr_1.4fr]")}>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">What it will not do</h2>
              <p className="mt-3 max-w-sm text-muted-foreground">
                The platforms set the rules. We would rather tell you the limits up front.
              </p>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {LIMITS.map((item) => (
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
            <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-[1fr_1.4fr]">
              <div className="bg-background p-8">
                <h3 className="text-sm font-medium">Free trial</h3>
                <p className="mt-4 text-4xl font-semibold tracking-tight">$0</p>
                <p className="mt-1 text-sm text-muted-foreground">for {PRICING.trialDays} days</p>
                <p className="mt-6 text-sm leading-6 text-muted-foreground">
                  Full access to everything in Pro. Cancel before the trial ends and you pay nothing.
                </p>
              </div>
              <div className="bg-background p-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Pro</h3>
                  <Badge tone="solid">After trial</Badge>
                </div>
                <p className="mt-4 text-4xl font-semibold tracking-tight">
                  ${PRICING.proPriceUsd}
                  <span className="text-base font-normal text-muted-foreground"> / month</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/login" className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full sm:w-auto")}>
                  Get started
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={cn(container, "flex h-16 items-center justify-between text-sm text-muted-foreground")}>
          <span>{PRODUCT_NAME}</span>
          <span>Works through the official X and Threads APIs.</span>
        </div>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_1fr] items-baseline gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
