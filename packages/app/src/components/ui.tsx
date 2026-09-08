import React, { useEffect, useRef, useState } from "react";

export function Card({ title, children, className = "", right }: { title?: React.ReactNode; children?: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="row between" style={{ marginBottom: 8 }}>
          {title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ children, onClick, variant = "", disabled, title, small }: { children: React.ReactNode; onClick?: () => void; variant?: "" | "primary" | "danger" | "ghost"; disabled?: boolean; title?: string; small?: boolean }) {
  return (
    <button className={`btn ${variant} ${small ? "small" : ""}`} onClick={onClick} disabled={disabled} title={title} type="button">
      {children}
    </button>
  );
}

/**
 * Touch stepper: tap ± for one step, press-and-hold to repeat, tap the number to type.
 * Used for every quick-edit override (Principle 3: one or two taps, no justification).
 */
export function Stepper({ value, onChange, min = -Infinity, max = Infinity, step = 1, bigStep = 5 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; bigStep?: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const timer = useRef<number | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const startHold = (delta: number) => {
    onChange(clamp(value + delta));
    let current = value + delta;
    timer.current = window.setTimeout(() => {
      timer.current = window.setInterval(() => {
        current = clamp(current + delta * bigStep);
        onChange(current);
      }, 250) as unknown as number;
    }, 500);
  };
  const stop = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => () => stop(), []);
  useEffect(() => setText(String(value)), [value]);
  return (
    <span className="stepper">
      <button type="button" onPointerDown={() => startHold(-step)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} aria-label="decrease">
        −
      </button>
      {editing ? (
        <input
          type="number"
          inputMode="numeric"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = Number(text);
            if (Number.isFinite(n)) onChange(clamp(n));
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span className="value" onClick={() => setEditing(true)} role="button">
          {value}
        </span>
      )}
      <button type="button" onPointerDown={() => startHold(step)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} aria-label="increase">
        +
      </button>
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function TextArea({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value} placeholder={placeholder} rows={rows} onChange={(e) => onChange(e.target.value)} />;
}

export function Pills<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="pill-row">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tag({ children, kind = "" }: { children: React.ReactNode; kind?: "" | "secret" | "ok" | "warn" | "danger" }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

export function SourceTag({ source, issues }: { source: "llm" | "fallback"; issues: string[] }) {
  return (
    <span>
      <Tag kind={source === "llm" ? "ok" : "warn"}>{source === "llm" ? "AI" : "Fallback"}</Tag>
      {issues.length > 0 && <Tag kind="warn">{issues.length} note{issues.length > 1 ? "s" : ""}</Tag>}
    </span>
  );
}

export function Issues({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return (
    <ul className="list small muted">
      {issues.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ul>
  );
}

export function Spinner({ label = "Working…" }: { label?: string }) {
  return <span className="muted">⏳ {label}</span>;
}
