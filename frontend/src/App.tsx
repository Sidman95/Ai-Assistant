import { Component, ReactNode, useCallback, useEffect, useState } from "react";
import { api, AuthError } from "./api";
import Dashboard from "./Dashboard";
import { Icon } from "./icons";
import ItemEditor from "./ItemEditor";
import CardsPage from "./CardsPage";
import Login from "./Login";
import ProjectsPage from "./ProjectsPage";
import SettingsPage from "./SettingsPage";
import TasksPage from "./TasksPage";
import { useTheme } from "./theme";
import { ItemType } from "./types";

type Tab = "dashboard" | "task" | "idea" | "note" | "project" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Дашборд", icon: "home" },
  { id: "task", label: "Задачи", icon: "check" },
  { id: "idea", label: "Идеи", icon: "bulb" },
  { id: "note", label: "Заметки", icon: "note" },
  { id: "project", label: "Проекты", icon: "folder" },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editorItemId, setEditorItemId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createType, setCreateType] = useState<ItemType>("task");
  const [refreshKey, setRefreshKey] = useState(0);
  const { resolved, setMode } = useTheme();

  useEffect(() => {
    api
      .get<{ username: string }>("/api/auth/me")
      .then((r) => {
        setUsername(r.username);
        setAuthed(true);
      })
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
  if (!authed)
    return (
      <Login
        onLogin={(u) => {
          setUsername(u);
          setAuthed(true);
        }}
      />
    );

  const initials = username.slice(0, 2).toUpperCase();
  const fabType: ItemType = tab === "idea" || tab === "note" || tab === "project" ? tab : "task";

  return (
    <div className="min-h-screen pb-28 md:pb-10">
      {/* Верхняя панель */}
      <header className="flex items-center gap-4 px-5 py-4 md:px-10">
        <button
          onClick={() => setTab("dashboard")}
          className="flex items-center gap-2.5"
          aria-label="Дашборд"
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-accent text-white">
            <Icon name="spark" size={17} />
          </span>
          <span className="text-base font-bold">Ассистент</span>
        </button>

        <nav className="mx-auto hidden gap-1 rounded-full border border-line2 bg-card p-1 md:flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-[13.5px] transition-colors lg:px-[18px] ${
                tab === t.id ? "bg-accent font-semibold text-white" : "text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            onClick={() => setMode(resolved === "dark" ? "light" : "dark")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line2 bg-card text-muted hover:text-ink"
            title="Сменить тему"
          >
            <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`flex h-9 w-9 items-center justify-center rounded-full border border-line2 bg-card ${
              tab === "settings" ? "text-accent-text" : "text-muted hover:text-ink"
            }`}
            title="Настройки"
          >
            <Icon name="gear" size={17} />
          </button>
          <button
            onClick={logout}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-avatar text-[13px] font-bold text-ink-2"
            title={`${username} — выйти`}
          >
            {initials}
          </button>
        </div>
      </header>

      {/* Контент */}
      <main className="mx-auto w-full max-w-[1160px] px-4 pt-2 md:px-10">
        <ErrorBoundary>
          {tab === "dashboard" && (
            <Dashboard
              username={username}
              onOpenItem={openItem}
              onGoTasks={() => setTab("task")}
              refreshKey={refreshKey}
            />
          )}
          {tab === "task" && (
            <TasksPage onOpenItem={openItem} onCreate={() => openCreate("task")} refreshKey={refreshKey} />
          )}
          {(tab === "idea" || tab === "note") && (
            <CardsPage
              type={tab}
              onOpenItem={openItem}
              onCreate={() => openCreate(tab)}
              refreshKey={refreshKey}
            />
          )}
          {tab === "project" && (
            <ProjectsPage onOpenItem={openItem} onCreate={() => openCreate("project")} refreshKey={refreshKey} />
          )}
          {tab === "settings" && <SettingsPage />}
        </ErrorBoundary>
      </main>

      {/* Мобильная навигация (из макета: плавающий pill + FAB) */}
      <button
        onClick={() => openCreate(fabType)}
        className="fixed bottom-[104px] right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white md:hidden"
        style={{ boxShadow: "0 6px 20px rgba(42,120,214,0.45)" }}
        aria-label="Создать"
      >
        <Icon name="plus" size={24} />
      </button>
      <nav
        className="fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line2 p-2 md:hidden"
        style={{
          background: "color-mix(in srgb, var(--card) 94%, transparent)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.25)",
          backdropFilter: "blur(8px)",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex h-[46px] w-[46px] items-center justify-center rounded-full ${
              tab === t.id ? "bg-accent text-white" : "text-muted"
            }`}
            aria-label={t.label}
          >
            <Icon name={t.icon} size={21} />
          </button>
        ))}
      </nav>

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
      return (
        <p className="p-6" style={{ color: "var(--red)" }}>
          Ошибка: {this.state.error.message}
        </p>
      );
    }
    return this.props.children;
  }
}
