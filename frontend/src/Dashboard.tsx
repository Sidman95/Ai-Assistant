import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "./api";
import { DashboardData } from "./types";
import { Badge, PRIORITY_NAMES, Spinner, fmtDate, priorityTone } from "./ui";

const ACCENT = "#2a78d6";
const GRID = "#e1e0d9";
const MUTED = "#898781";

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-ink-2">{label}</div>
    </div>
  );
}

export default function Dashboard({ onOpenItem }: { onOpenItem: (id: number) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [insights, setInsights] = useState("");
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  async function loadInsights() {
    setInsightsBusy(true);
    try {
      const resp = await api.post<{ insights: string }>("/api/dashboard/insights");
      setInsights(resp.insights);
    } catch (e) {
      setInsights("ИИ-провайдер недоступен, попробуйте позже.");
    } finally {
      setInsightsBusy(false);
    }
  }

  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!data) return <Spinner />;

  const counts = data.counts;
  const activeTasks = counts.task?.active ?? 0;
  const doneTasks = counts.task?.done ?? 0;
  const series = data.done_series.map((d) => ({
    ...d,
    label: d.date.slice(8, 10) + "." + d.date.slice(5, 7),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Активных задач" value={activeTasks} />
        <StatTile label="Завершено всего" value={doneTasks} />
        <StatTile label="Идей" value={counts.idea?.active ?? 0} />
        <StatTile label="Сделано сегодня" value={data.day_report.done_count} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface p-4">
          <h3 className="mb-3 text-sm font-medium text-ink-2">
            Завершённые задачи, последние 14 дней
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} width={24} />
              <Tooltip formatter={(v) => [String(v), "завершено"]} labelFormatter={(l) => `Дата: ${l}`} />
              <Bar dataKey="done" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-4">
          <h3 className="mb-3 text-sm font-medium text-ink-2">Активные задачи по сферам</h3>
          {data.active_by_tag.length === 0 ? (
            <p className="text-sm text-muted">Нет активных задач со сферами.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.active_by_tag} layout="vertical">
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="tag"
                  width={90}
                  tick={{ fill: MUTED, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(v) => [String(v), "задач"]} />
                <Bar dataKey="count" fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface p-4">
          <h3 className="mb-3 text-sm font-medium text-ink-2">Ближайшие дедлайны</h3>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Задач с дедлайнами нет.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <button
                    className="truncate text-left hover:text-accent"
                    onClick={() => onOpenItem(t.id)}
                  >
                    #{t.id} {t.title}
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={priorityTone(t.priority)}>
                      {PRIORITY_NAMES[t.priority] ?? t.priority}
                    </Badge>
                    <span className="text-muted">{fmtDate(t.deadline)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink-2">ИИ-инсайты</h3>
            <button
              onClick={loadInsights}
              disabled={insightsBusy}
              className="rounded bg-accent px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {insightsBusy ? "Анализирую…" : "Обновить"}
            </button>
          </div>
          {insights ? (
            <p className="whitespace-pre-wrap text-sm">{insights}</p>
          ) : (
            <p className="text-sm text-muted">
              Нажмите «Обновить» — ИИ проанализирует ваши данные и подготовит выводы.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
