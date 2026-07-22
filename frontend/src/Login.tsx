import { FormEvent, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";

export default function Login({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const resp = await api.post<{ username: string }>("/api/auth/login", { username, password });
      onLogin(resp.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "block w-full rounded-xl border border-line2 bg-input px-4 py-3 text-[14.5px] outline-none focus:border-accent";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* декоративные пятна из макета */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: -180,
          right: -120,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: -220,
          left: -160,
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--row) 0%, transparent 70%)",
        }}
      />
      <form
        onSubmit={submit}
        className="relative w-[400px] rounded-[22px] border border-line bg-card p-9"
        style={{ boxShadow: "0 8px 32px rgba(30,30,25,0.07)" }}
      >
        <div className="mb-7 flex flex-col items-center gap-3.5">
          <span
            className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-accent text-white"
            style={{ boxShadow: "0 4px 14px rgba(42,120,214,0.3)" }}
          >
            <Icon name="spark" size={28} />
          </span>
          <span className="text-[21px] font-extrabold">Личный ассистент</span>
          <span className="-mt-2 text-center text-[13.5px] text-muted">
            Задачи, идеи и заметки — из Telegram в порядок
          </span>
        </div>
        <div className="flex flex-col gap-3.5">
          <label>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Логин</span>
            <input
              className={input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Пароль</span>
            <input
              type="password"
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
          <button
            disabled={busy}
            className="mt-1.5 rounded-xl bg-accent py-3.5 text-[15px] font-bold text-white shadow-btn disabled:opacity-50"
          >
            {busy ? "Вход…" : "Войти"}
          </button>
        </div>
        <div className="mt-5 flex items-center gap-2.5 border-t border-divider pt-5 text-[12.5px] text-muted">
          <Icon name="mic" size={15} className="shrink-0" />
          Добавлять записи можно голосом и фото — через Telegram-бота
        </div>
      </form>
    </div>
  );
}
