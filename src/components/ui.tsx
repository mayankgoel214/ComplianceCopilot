import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The primitives every page is built from.
 *
 * Kept in one file on purpose: there are nine of them, they share a vocabulary,
 * and splitting nine small components across nine files makes the system harder
 * to hold in your head, not easier. They are server components unless they need
 * state, so none of this ships as client JavaScript.
 */

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-medium rounded-md " +
  "transition-[background-color,border-color,color,transform,opacity] duration-150 " +
  "active:translate-y-px disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-[var(--shadow-sm)]",
  secondary: "border border-line-strong bg-surface-2 text-fg hover:bg-elevated hover:border-fg-faint",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  interactive = false,
  ...props
}: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface",
        interactive &&
          "transition-[border-color,transform] duration-200 hover:border-line-strong hover:-translate-y-0.5",
        className
      )}
      {...props}
    />
  );
}

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-faint">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-fg-muted leading-relaxed max-w-3xl">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Data display                                                                */
/* -------------------------------------------------------------------------- */

export function Stat({
  value,
  label,
  hint,
  accent = false,
}: {
  value: string;
  label: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="px-4 py-3.5" interactive>
      <div
        className={cn(
          "text-[26px] leading-none font-semibold tabular-nums tracking-tight",
          accent && "text-accent"
        )}
      >
        {value}
      </div>
      <div className="text-[12px] text-fg-muted mt-2 leading-snug">{label}</div>
      {hint ? <div className="text-[11px] text-fg-faint mt-1 leading-snug">{hint}</div> : null}
    </Card>
  );
}

export type Verdict = "exact" | "near" | "unsupported";

const VERDICT_STYLE: Record<Verdict, string> = {
  exact: "text-verified bg-[var(--verified-soft)] border-[color-mix(in_srgb,var(--verified)_35%,transparent)]",
  near: "text-near bg-[var(--near-soft)] border-[color-mix(in_srgb,var(--near)_35%,transparent)]",
  unsupported:
    "text-unsupported bg-[var(--unsupported-soft)] border-[color-mix(in_srgb,var(--unsupported)_40%,transparent)]",
};

type BadgeTone = Verdict | "neutral" | "accent";

const BADGE_STYLE: Record<BadgeTone, string> = {
  ...VERDICT_STYLE,
  neutral: "text-fg-muted bg-surface-2 border-line",
  accent: "text-accent bg-[var(--accent-soft)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[10.5px] font-semibold uppercase tracking-[0.08em]",
        BADGE_STYLE[tone],
        className
      )}
      {...props}
    />
  );
}

/** A monospace citation. Regulation references are identifiers, not prose. */
export function Citation({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("font-mono text-[11.5px] text-fg-faint tracking-tight", className)}
      {...props}
    />
  );
}

export function Quote({
  children,
  source,
  tone = "neutral",
}: {
  children: ReactNode;
  source: ReactNode;
  tone?: BadgeTone;
}) {
  const bar =
    tone === "exact"
      ? "before:bg-verified"
      : tone === "near"
        ? "before:bg-near"
        : tone === "unsupported"
          ? "before:bg-unsupported"
          : "before:bg-line-strong";

  return (
    <blockquote
      className={cn(
        "relative pl-4 py-0.5",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:rounded-full",
        bar
      )}
    >
      <p className="text-[13.5px] leading-relaxed text-fg-muted italic">{children}</p>
      <footer className="text-[11px] text-fg-faint mt-1.5">{source}</footer>
    </blockquote>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="text-[13px] text-fg-muted mt-1.5 max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[color-mix(in_srgb,var(--unsupported)_40%,transparent)] bg-[var(--unsupported-soft)] px-4 py-3.5 space-y-1"
    >
      <p className="text-sm font-medium text-unsupported">{title}</p>
      <p className="text-[13px] text-fg-muted leading-relaxed">{detail}</p>
    </div>
  );
}
