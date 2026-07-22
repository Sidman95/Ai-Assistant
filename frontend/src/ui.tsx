import { CSSProperties, ReactNode } from "react";
import { Icon } from "./icons";

export const TYPE_NAMES: Record<string, string> = {
  task: "Задача",
  idea: "Идея",
  note: "Заметка",
  project: "Проект",
};

export const TYPE_ICONS: Record<string, string> = {
  task: "check",
  idea: "bulb",
  note: "note",
  project: "folder",
};

export const STATUS_NAMES: Record<string, string> = {
  active: "Активная",
  done: "Завершена",
  cancelled: "Отменена",
  delegated: "Передана",
  archived: "В архиве",
};

export const PRIORITY_NAMES: Record<string, string> = {
  asap: "ASAP",
  high: "высокий",
  medium: "средний",
  low: "низкий",
};

/* Цвета сфер: преднастроенные — фиксированные (как в макете), остальные — по хэшу */
const TONES = [
  { bg: "var(--accent-soft)", fg: "var(--accent-text)" },
  { bg: "var(--green-soft)", fg: "var(--green)" },
  { bg: "var(--amber-soft)", fg: "var(--amber)" },
  { bg: "var(--violet-soft)", fg: "var(--violet)" },
] as const;

const PRESET_TONE: Record<string, number> = { работа: 0, дом: 1, ремонт: 2, идеи: 3 };

export function tagTone(name: string): { bg: string; fg: string } {
  const key = name.toLowerCase();
  if (key in PRESET_TONE) return TONES[PRESET_TONE[key]];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return TONES[h % TONES.length];
}

export function TagChip({ name }: { name: string }) {
  const tone = tagTone(name);
  return (
    <span
      className="rounded-lg px-2 py-0.5 text-xs capitalize"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {name}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: string | null }) {
  if (priority === "asap")
    return (
      <span
        className="rounded-lg px-2 py-0.5 text-xs font-bold"
        style={{ background: "var(--red-soft)", color: "var(--red)" }}
      >
        ASAP
      </span>
    );
  if (priority === "high")
    return (
      <span
        className="rounded-lg px-2 py-0.5 text-xs font-bold"
        style={{ background: "var(--orange-soft)", color: "var(--orange)" }}
      >
        высокий
      </span>
    );
  return null;
}

/* Круглый чекбокс задачи (из макета) */
export function CheckCircle({
  done,
  onClick,
  size = 20,
}: {
  done: boolean;
  onClick?: () => void;
  size?: number;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={done ? "Вернуть в работу" : "Завершить"}
      className="flex shrink-0 items-center justify-center rounded-full transition-colors"
      style={{
        width: size,
        height: size,
        border: done ? "none" : "1.5px solid var(--check)",
        background: done ? "var(--green)" : "transparent",
      }}
    >
      {done && (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 20 20" style={{ color: "#fff" }}>
          <path
            d="M5 10.5l3.2 3L15 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export function Card({
  children,
  className = "",
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-card border border-line bg-card shadow-card ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  icon,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-btn disabled:opacity-50 ${className}`}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function DashedCreate({ label, onClick, minHeight = 180 }: { label: string; onClick: () => void; minHeight?: number }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2.5 rounded-card text-muted transition-colors hover:text-ink-2"
      style={{ border: "1.5px dashed var(--dashed)", minHeight }}
    >
      <Icon name="plus" size={24} />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* «сегодня» / «чт, 24 июл» / «1 авг» */
export function fmtDeadline(iso: string | null): { text: string; urgent: boolean } {
  if (!iso) return { text: "", urgent: false };
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: "просрочено", urgent: true };
  if (diff === 0) return { text: "сегодня", urgent: true };
  if (diff === 1) return { text: "завтра", urgent: false };
  const short = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  if (diff < 7) {
    const wd = d.toLocaleDateString("ru-RU", { weekday: "short" });
    return { text: `${wd}, ${short}`, urgent: false };
  }
  return { text: short, urgent: false };
}

export function Spinner() {
  return <div className="p-10 text-center text-muted">Загрузка…</div>;
}
