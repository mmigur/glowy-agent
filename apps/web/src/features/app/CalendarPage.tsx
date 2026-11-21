import { EmptyState } from "../../components/EmptyState";
import { Badge } from "../../components/ui/badge";
import { PageHeader } from "./PageHeader";

const STATUSES = [
  { label: "Draft", tone: "muted" },
  { label: "Scheduled", tone: "outline" },
  { label: "Publishing", tone: "outline" },
  { label: "Published", tone: "solid" },
  { label: "Failed", tone: "muted" },
] as const;

export function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="Scheduled, published and draft posts in one place." />
      <EmptyState
        title="Nothing scheduled"
        description="Approved drafts show up here with their publishing time and status."
      />
      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Statuses:</span>
        {STATUSES.map((s) => (
          <Badge key={s.label} tone={s.tone}>
            {s.label}
          </Badge>
        ))}
      </div>
    </>
  );
}
