import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium leading-4",
  {
    variants: {
      tone: {
        solid: "border-foreground bg-foreground text-background",
        outline: "border-border-strong text-foreground",
        muted: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { tone: "outline" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
