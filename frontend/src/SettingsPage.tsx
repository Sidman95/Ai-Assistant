import { useEffect, useState } from "react";
import { api } from "./api";
import { SettingsData } from "./types";
import { Spinner } from "./ui";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

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

  if (error && !settings) return <p className="p-6 text-red-700">{error}</p>;
  if (!settings) return <Spinner />;

  const input = "mt-1 w-full rounded border border-hairline bg-surface px-2 py-1.5 text-sm";

  return (
    <div className="max-w-md space-y-4">
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <h2 className="mb-4 font-medium">Уведомления бота</h2>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.morning_report_enabled}
            onChange={(e) =>
              setSettings({ ...settings, morning_report_enabled: e.target.checked })
            }
          />
          Присылать утренний отчёт (план дня) в Telegram
        </label>
        <label className="mb-3 block text-sm text-ink-2">
          Время отчёта
          <input
            type="time"
            className={input}
            value={settings.morning_report_time}
            onChange={(e) => setSettings({ ...settings, morning_report_time: e.target.value })}
          />
        </label>
        <label className="mb-3 block text-sm text-ink-2">
          Часовой пояс (IANA, напр. Asia/Barnaul)
          <input
            className={input}
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
          />
        </label>
        <p className="mb-4 text-xs text-muted">
          По умолчанию бот молчит и отвечает только по запросу. Утренний отчёт — единственное
          плановое уведомление.
        </p>
        {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
        <button onClick={save} className="rounded bg-accent px-4 py-1.5 text-sm text-white">
          {saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
