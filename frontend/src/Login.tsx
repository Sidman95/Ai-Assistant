import { FormEvent, useState } from "react";
import { api } from "./api";

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

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={submit}
        className="w-80 rounded-xl border border-hairline bg-surface p-6 shadow-sm"
      >
        <h1 className="mb-4 text-lg font-semibold">Личный ассистент задач</h1>
        <label className="mb-2 block text-sm text-ink-2">
          Логин
          <input
            className="mt-1 w-full rounded border border-hairline px-2 py-1.5"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>
        <label className="mb-4 block text-sm text-ink-2">
          Пароль
          <input
            type="password"
            className="mt-1 w-full rounded border border-hairline px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-accent py-1.5 text-white disabled:opacity-50"
        >
          {busy ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
