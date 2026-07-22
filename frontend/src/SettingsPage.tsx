import { useEffect, useState } from "react";
import { api } from "./api";
import { ThemeMode, useTheme } from "./theme";
import { SettingsData } from "./types";
import { Card, Spinner } from "./ui";

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Светлая" },
  { id: "dark", label: "Тёмная" },
  { id: "system", label: "Системная" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const { mode, setMode } = useTheme();

  useEffect(() => {
    api.get<SettingsData>("/api/settings").then(setSettings).catch((e) => setError(e.message));
  }, []);

  async function save() {
    if (!settings) return;
    setError("");
    try {
      const updated = await api.patch<SettingsData>("/api/settings", settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }

  if (error && !settings) return <p className="p-6" style={{ color: "var(--red)" }}>{error}</p>;
  if (!settings) return <Spinner />;

  const input =
    "block w-full rounded-[10px] border border-line2 bg-input px-3.5 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <div className="flex max-w-[656px] flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Настройки</h1>

      <Card className="p-6">
        <div className="mb-3.5 text-[15px] font-bold">Оформление</div>
        <div className="flex w-fit gap-1 rounded-xl bg-row p-1">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setMode(o.id)}
              className={`rounded-[9px] px-5 py-2 text-[13.5px] transition-colors ${
                mode === o.id ? "bg-card font-semibold shadow-card" : "text-ink-2"
              }`}
              style={mode === o.id ? { boxShadow: "0 1px 2px rgba(30,30,25,0.08)" } : undefined}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <div className="text-[15px] font-bold">Уведомления бота</div>
        <div className="flex items-center gap-3.5">
          <button
            className="switch"
            data-on={settings.morning_report_enabled}
            onClick={() =>
              setSettings({ ...settings, morning_report_enabled: !settings.morning_report_enabled })
            }
            aria-label="Утренний отчёт"
          />
          <span className="text-sm">Присылать утренний отчёт (план дня) в Telegram</span>
        </div>
        <div className="flex flex-col gap-3.5 sm:flex-row">
          <label className="flex-1">
            <span className="mb-1.5 block text-[13px] text-ink-2">Время отчёта</span>
            <input
              type="time"
              className={input}
              value={settings.morning_report_time}
              onChange={(e) => setSettings({ ...settings, morning_report_time: e.target.value })}
            />
          </label>
          <label className="flex-[2]">
            <span className="mb-1.5 block text-[13px] text-ink-2">Часовой пояс</span>
            <input
              className={input}
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            />
          </label>
        </div>
        <p className="text-[12.5px] text-muted">
          По умолчанию бот молчит и отвечает только по запросу. Утренний отчёт — единственное
          плановое уведомление.
        </p>
        {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        <button
          onClick={save}
          className="w-fit rounded-full bg-accent px-[22px] py-2.5 text-sm font-semibold text-white shadow-btn"
        >
          {saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </Card>
    </div>
  );
}
