const KINDS = ["connect", "setup", "research", "publish"] as const;
export type StepKind = (typeof KINDS)[number];

export function StepScene({ kind }: { kind: StepKind }) {
  if (kind === "connect") return <ConnectScene />;
  if (kind === "setup") return <SetupScene />;
  if (kind === "research") return <ResearchScene />;
  return <PublishScene />;
}

function ConnectScene() {
  return (
    <div className="step-scene" aria-hidden>
      <div className="step-orbit">
        <span className="step-core">@</span>
        <i className="step-sat" />
        <i className="step-sat step-sat-2" />
        <i className="step-sat step-sat-3" />
      </div>
      <div className="step-bridge">
        <span />
      </div>
      <div className="step-account">
        <span className="step-avatar" />
        <span className="step-line step-line-a" />
        <span className="step-line step-line-b" />
      </div>
    </div>
  );
}

function SetupScene() {
  return (
    <div className="step-scene" aria-hidden>
      <div className="step-options">
        {[0, 1, 2].map((i) => (
          <div key={i} className="step-option" style={{ animationDelay: `${i * 0.6}s` }}>
            <span className="step-option-bar" />
            <span className="step-option-mark" style={{ animationDelay: `${0.35 + i * 0.6}s` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchScene() {
  const cards = [0, 1, 2, 3];
  return (
    <div className="step-scene" aria-hidden>
      <div className="step-feed">
        {[...cards, ...cards].map((n, i) => (
          <div key={i} className="step-post">
            <span className="step-post-at">@</span>
            <span className="step-post-copy">
              <i style={{ width: `${72 - (n % 3) * 14}%` }} />
              <i style={{ width: `${48 + (n % 2) * 18}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="step-scan" />
    </div>
  );
}

function PublishScene() {
  return (
    <div className="step-scene" aria-hidden>
      <div className="step-cal">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} className={i === 7 ? "step-cal-hot" : undefined} />
        ))}
      </div>
      <div className="step-chip">
        <span className="step-chip-at">@</span>
        <span className="step-chip-lines">
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
