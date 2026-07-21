import { useCallback, useEffect, useState } from "react";
import { api, AuthError } from "./api";
import Dashboard from "./Dashboard";
import ItemEditor from "./ItemEditor";
import ItemsPage from "./ItemsPage";
import Login from "./Login";
import SettingsPage from "./SettingsPage";
import { ItemType } from "./types";

type Tab = "dashboard" | "task" | "idea" | "note" | "project" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Дашборд" },
  { id: "task", label: "Задачи" },
  { id: "idea", label: "Идеи" },
  { id: "note", label: "Заметки" },
  { id: "project", label: "Проекты" },
  { id: "settings", label: "Настройки" },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editorItemId, setEditorItemId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createType, setCreateType] = useState<ItemType>("task");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  const openItem = useCallback((id: number) => {
    setEditorItemId(id);
    setEditorOpen(true);
  }, []);

  const openCreate = useCallback((type: ItemType) => {
    setCreateType(type);
    setEditorItemId(null);
    setEditorOpen(true);
  }, []);

  async function logout() {
    await api.post("/api/auth/logout");
    setAuthed(false);
  }

  if (authed === null) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-5 flex items-center gap-4">
        <h1 className="text-lg font-semibold">🧠 Ассистент</h1>
        <nav className="flex flex-1 flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === t.id ? "bg-accent text-white" : "text-ink-2 hover:bg-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button onClick={logout} className="text-sm text-muted hover:text-ink">
          Выйти
        </button>
      </header>

      <ErrorBoundary>
        {tab === "dashboard" && <Dashboard onOpenItem={openItem} />}
        {(tab === "task" || tab === "idea" || tab === "note" || tab === "project") && (
          <ItemsPage
            type={tab}
            onOpenItem={openItem}
            onCreate={openCreate}
            refreshKey={refreshKey}
          />
        )}
        {tab === "settings" && <SettingsPage />}
      </ErrorBoundary>

      {editorOpen && (
        <ItemEditor
          itemId={editorItemId}
          createType={createType}
          onClose={(changed) => {
            setEditorOpen(false);
            if (changed) setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

import { Component, ReactNode } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.state.error instanceof AuthError) {
        window.location.reload();
        return null;
      }
      return <p className="p-6 text-red-700">Ошибка: {this.state.error.message}</p>;
    }
    return this.props.children;
  }
}
