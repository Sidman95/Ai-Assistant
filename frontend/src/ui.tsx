import { ReactNode } from "react";

export const TYPE_NAMES: Record<string, string> = {
  task: "Задача",
  idea: "Идея",
  note: "Заметка",
  project: "Проект",
};

export const TYPE_ICONS: Record<string, string> = {
  task: "✅",
  idea: "💡",
  note: "📝",
  project: "📁",
};

export const STATUS_NAMES: Record<string, string> = {
  active: "активная",
  done: "завершена",
  cancelled: "отменена",
  delegated: "передана",
  archived: "в архиве",
};

export const PRIORITY_NAMES: Record<string, string> = {
  asap: "ASAP",
  high: "высокий",
  medium: "средний",
  low: "низкий",
};

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-ink-2",
    blue: "bg-blue-50 text-accent",
    red: "bg-red-50 text-red-700",
    green: "bg-green-50 text-green-800",
    amber: "bg-amber-50 text-amber-800",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${tones[tone] ?? tones.gray}`}>
      {children}
    </span>
  );
}

export function priorityTone(p: string | null): string {
  if (p === "asap") return "red";
  if (p === "high") return "amber";
  return "gray";
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function Spinner() {
  return <div className="p-8 text-center text-muted">Загрузка…</div>;
}
