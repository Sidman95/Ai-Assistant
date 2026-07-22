import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { DashboardData } from "./types";
import { Card, CheckCircle, PriorityChip, Spinner, fmtDeadline } from "./ui";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function todayLine(data: DashboardData): string {
  const date = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const cap = date.charAt(0).toUpperCase() + date.slice(1);
  const n = data.plan.tasks_deadline_today.length + data.plan.tasks_asap.length;
  return `${cap} · задач на сегодня: ${n}, сделано сегодня: ${data.day_report.done_count}`;
}

const STAT_TONES = [
  { icon: "check", color: "var(--accent-text)" },
  { icon: "chart", color: "var(--green)" },
  { icon: "bulb", color: "var(--amber)" },
  { icon: "cal", color: "var(--violet)" },
];

export default function Dashboard({
  username,
  onOpenItem,
  onGoTasks,
  refreshKey,
}: {
  username: string;
  onOpenItem: (id: number) => void;
  onGoTasks: () => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [insights, setInsights] = useState("");
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load, refreshKey]);

  async function toggleTask(id: number, done: boolean) {
    await api.post(`/api/items/${id}/status`, { status: done ? "active" : "done" });
    load();
  }

  async function loadInsights() {
    setInsightsBusy(true);
    try {
      const resp = await api.post<{ insights: string }>("/api/dashboard/insights");
      setInsights(resp.insights);
    } catch {
      setInsights("ИИ-провайдер недоступен, попробуйте позже.");
    } finally {
      setInsightsBusy(false);
    }
  }

  if (error) return <p className="p-6" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <Spinner />;

  const counts = data.counts;
  const stats = [
    { label: "Активных задач", value: counts.task?.active ?? 0 },
    { label: "Сделано сегодня", value: data.day_report.done_count },
    { label: "Идей в копилке", value: counts.idea?.active ?? 0 },
    { label: "Завершено всего", value: counts.task?.done ?? 0 },
  ];

  const series = data.done_series;
  const max = Math.max(1, ...series.map((d) => d.done));
  const name = username.charAt(0).toUpperCase() + username.slice(1);

  const planTasks = [
    ...data.plan.tasks_deadline_today.map((t) => ({ ...t, deadline: true })),
    ...data.plan.tasks_asap.map((t) => ({ ...t, priority: "asap", deadline: false })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-tight">
          {greeting()}, {name}
        </h1>
        <p className="mt-1 text-[15px] text-muted">{todayLine(data)}</p>
      </div>

      {/* Плитки */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.label} className="p-5">
            <div className="mb-2.5 flex items-center gap-2" style={{ color: STAT_TONES[i].color }}>
              <Icon name={STAT_TONES[i].icon} size={18} />
              <span className="text-[13px] font-semibold text-ink-2">{s.label}</span>
            </div>
            <div className="text-3xl font-extrabold">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* План на день */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-base font-bold">План на день</span>
            <button onClick={onGoTasks} className="text-[13px] font-semibold text-accent-text">
              Все задачи →
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {planTasks.length === 0 && (
              <p className="py-4 text-sm text-muted">На сегодня задач нет 🎉</p>
            )}
            {planTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => onOpenItem(t.id)}
                className="flex cursor-pointer items-center gap-3.5 rounded-xl bg-row px-3.5 py-3"
              >
                <CheckCircle done={false} onClick={() => toggleTask(t.id, false)} />
                <span className="flex-1 truncate text-[15px] font-medium">{t.title}</span>
                <PriorityChip priority={t.priority} />
                {t.deadline && "overdue" in t && (t as { overdue?: boolean }).overdue && (
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--red)" }}>
                    просрочено
                  </span>
                )}
              </div>
            ))}
            {data.plan.notes_today.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {data.plan.notes_today.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => onOpenItem(n.id)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-ink-2"
                  >
                    <Icon name="cal" size={15} className="shrink-0 text-accent-text" />
                    {n.title || n.body}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          {/* График за 14 дней */}
          <Card className="p-6">
            <div className="mb-3.5 text-base font-bold">Последние 14 дней</div>
            <div className="flex h-[110px] items-end gap-1.5">
              {series.map((d, i) => {
                const isMax = d.done === max && d.done > 0;
                const isToday = i === series.length - 1;
                const h = d.done === 0 ? 4 : Math.max(8, (d.done / max) * 100);
                return (
                  <div
                    key={d.date}
                    className="flex-1 rounded-md"
                    title={`${new Date(d.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}: ${d.done}`}
                    style={{
                      height: `${h}%`,
                      background: isMax || (isToday && d.done > 0) ? "var(--accent)" : "var(--chart-bar)",
                    }}
                  />
                );
              })}
            </div>
          </Card>

          {/* ИИ-инсайты */}
          <div className="rounded-card bg-accent p-6 text-white">
            <div className="mb-2.5 flex items-center gap-2">
              <Icon name="spark" size={17} />
              <span className="text-[15px] font-bold">ИИ-инсайты</span>
            </div>
            <p className="mb-3.5 whitespace-pre-wrap text-[13.5px] leading-relaxed opacity-90">
              {insights ||
                "Нажмите «Обновить анализ» — ИИ посмотрит на ваши данные и подготовит выводы."}
            </p>
            <button
              onClick={loadInsights}
              disabled={insightsBusy}
              className="rounded-[9px] px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              {insightsBusy ? "Анализирую…" : "Обновить анализ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
