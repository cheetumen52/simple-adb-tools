import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { clock } from "../lib/format";

/** Bracket-H mark from the hejzlar-development.cz favicon; `arrow` swaps the dot for a download arrow. */
export function BrandMark({ size = 28, arrow = false }: { size?: number; arrow?: boolean }) {
  const id = `g${size}${arrow ? "a" : "d"}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--mark-start)" />
          <stop offset="1" stopColor="var(--mark-end)" />
        </linearGradient>
      </defs>
      <path d="M10 6H6v20h4M22 6h4v20h-4" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {arrow ? (
        <path d="M16 10.5v10M12 16.5l4 4 4-4" stroke="var(--mark-start)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <circle cx="16" cy="16" r="2.5" fill="var(--mark-start)" />
      )}
    </svg>
  );
}

export const Kicker = ({ children, muted, color }: { children: ReactNode; muted?: boolean; color?: string }) => (
  <div className={`kicker${muted ? " muted" : ""}`} style={color ? { color } : undefined}>
    {children}
  </div>
);

export function SectionHeader({ number, kicker, title, lede, trailing }: { number: string; kicker: string; title: string; lede?: string; trailing?: ReactNode }) {
  return (
    <div className="section-header">
      <div className="section-num">{number}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Kicker>{kicker}</Kicker>
        <div className="section-title">{title}</div>
        {lede && <div className="lede">{lede}</div>}
      </div>
      {trailing}
    </div>
  );
}

export function Card({ children, highlight, danger, compact, style }: { children: ReactNode; highlight?: boolean; danger?: boolean; compact?: boolean; style?: CSSProperties }) {
  return <div className={`card${highlight ? " highlight" : ""}${danger ? " danger" : ""}${compact ? " compact" : ""}`} style={style}>{children}</div>;
}

export function CardTitle({ kicker, title, subtitle }: { kicker: string; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 3, minWidth: 0 }}>
      <Kicker muted>{kicker}</Kicker>
      <div className="title-sm">{title}</div>
      {subtitle && <div className="caption">{subtitle}</div>}
    </div>
  );
}

export const Pill = ({ children, color = "var(--light-cyan)", dot = true }: { children: ReactNode; color?: string; dot?: boolean }) => (
  <span className="pill" style={{ "--pill": color } as CSSProperties}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

type ButtonProps = {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "link" | "plain" | "danger";
  small?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
};

export function Button({ children, onClick, variant = "ghost", small, icon, disabled, title, style }: ButtonProps) {
  const cls = ["btn", variant !== "ghost" && variant, small && "sm", !children && icon && "icon"].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={onClick} disabled={disabled} title={title} style={style}>
      {icon}
      {children}
    </button>
  );
}

export function Switch({ label, checked, onChange, disabled, title }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label className={`switch${disabled ? " disabled" : ""}`} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label}
    </label>
  );
}

export function Checkbox({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      className={`checkbox${checked && !disabled ? " on" : ""}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      {checked && !disabled && <Check size={12} strokeWidth={3.5} />}
    </button>
  );
}

export function TextField({ value, onChange, placeholder, onSubmit, style, mono = true, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; onSubmit?: () => void; style?: CSSProperties; mono?: boolean; disabled?: boolean }) {
  return (
    <input
      className="field"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      style={{ ...(mono ? {} : { fontFamily: "var(--font)", fontSize: 13 }), ...style }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
    />
  );
}

export const Spinner = () => <div className="spinner" />;

export const Progress = ({ value }: { value: number }) => (
  <div className="progress">
    <div style={{ width: `${Math.round(value * 100)}%` }} />
  </div>
);

export function Elapsed({ since, className = "mono c-accent" }: { since: number; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <span className={className}>{clock((Date.now() - since) / 1000)}</span>;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirm: string;
  action: () => void;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  if (!request) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{request.title}</h3>
        <p>{request.message}</p>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
          <Button onClick={onClose}>Zrušit</Button>
          <Button
            variant="danger"
            onClick={() => {
              request.action();
              onClose();
            }}
          >
            {request.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Menu({ label, children }: { label: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn link" onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <div className="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}
