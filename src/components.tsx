import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { safeUrl } from "./types";

export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className="tooltip-wrap">
      <button
        type="button"
        className={`icon-button ${className}`}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon size={17} strokeWidth={1.7} />
      </button>
      <span role="tooltip" className="tooltip">
        {label}
      </span>
    </span>
  );
}
export function Button({
  children,
  icon: Icon,
  onClick,
  variant = "secondary",
  disabled,
  loading,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <LoaderCircle className="spin" size={16} />
      ) : (
        Icon && <Icon size={16} strokeWidth={1.8} />
      )}
      <span>{children}</span>
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="status-dot" />}
      {children}
    </span>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="toggle-hit"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className={`toggle ${checked ? "checked" : ""}`}>
        <span />
      </span>
    </button>
  );
}
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value)),
    [error, setError] = useState("");
  const errorId = useId();
  useEffect(() => {
    setText(String(value));
    setError("");
  }, [value]);
  return (
    <div className="number-field">
      <span>{label}</span>
      <div>
        <div className="number-control">
          <button
            aria-label={`减少${label}`}
            onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
            disabled={disabled || value <= min}
          >
            <Minus size={14} />
          </button>
          <input
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            type="number"
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
              const n = e.target.valueAsNumber;
              if (
                e.target.value !== "" &&
                Number.isFinite(n) &&
                n >= min &&
                n <= max &&
                e.target.validity.valid
              )
                onChange(n);
            }}
            onBlur={(e) => {
              if (!e.target.value || !e.target.validity.valid) {
                setText(String(value));
                setError(`范围 ${min}–${max}，已保留原值`);
              }
            }}
          />
          <button
            aria-label={`增加${label}`}
            onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
            disabled={disabled || value >= max}
          >
            <Plus size={14} />
          </button>
          {unit && <small>{unit}</small>}
        </div>
        {error && (
          <small id={errorId} className="field-error">
            {error}
          </small>
        )}
      </div>
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <label className={`select-wrap ${compact ? "compact" : ""}`}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
export function SearchInput({
  value,
  onChange,
  label = "搜索",
  placeholder = "搜索信源、平台或领域…",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <label className="search-input">
      <Search size={16} />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label={`清除${label}`}
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
export function Empty({
  icon: Icon = Search,
  title,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={26} strokeWidth={1.3} />
      <p>{title}</p>
      {children}
    </div>
  );
}
export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const url = safeUrl(href);
  return url ? (
    <a
      className={`external-link ${className}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={14} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton icon={X} label="关闭" onClick={onClose} />
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function SectionHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <div className="check-line">
      <Check size={15} />
      {children}
    </div>
  );
}
