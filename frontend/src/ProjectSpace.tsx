import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { Item, Tag } from "./types";
import {
  Card,
  CheckCircle,
  PriorityChip,
  Spinner,
  TagChip,
  fmtDate,
  fmtDateShort,
  fmtDeadline,
  tagTone,
} from "./ui";

const PRIORITY_ORDER: Record<string, number> = { asap: 0, high: 1, medium: 2, low: 3 };
const RECURRENCE_NAMES: Record<string, string> = { yearly: "ежегодно", monthly: "ежемесячно" };
const PROJECT_STATUS: { id: string; label: string }[] = [
  { id: "active", label: "Активный" },
  { id: "done", label: "Завершён" },
  { id: "cancelled", label: "Отменён" },
];

/* Поповер «добавить существующую запись» */
function AttachSearch({
  type,
  projectId,
  onDone,
  onClose,
}: {
  type: "task" | "idea" | "note";
  projectId: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Item[]>([]);

  async function search() {
    const found = await api.get<Item[]>(
      `/api/items?type=${type}&text=${encodeURIComponent(text.trim())}`
    );
    setResults(found.filter((f) => f.project_id !== projectId).slice(0, 8));
  }

  async function attach(id: number) {
    await api.patch(`/api/items/${id}`, { project_id: projectId });
    onDone();
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-input p-2.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="flex-1 rounded-full border border-line2 bg-card px-3.5 py-1.5 text-[13px] outline-none placeholder:text-muted"
          placeholder="найти запись…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
            if (e.key === "Escape") onClose();
          }}
        />
        <button onClick={search} className="text-[13px] font-semibold text-accent-text">
          Найти
        </button>
        <button onClick={onClose} className="flex text-muted">
          <Icon name="x" size={14} />
        </button>
      </div>
      {results.map((r) => (
        <button
          key={r.id}
          onClick={() => attach(r.id)}
          className="flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-row"
        >
          <Icon name="plus" size={13} className="shrink-0 text-accent-text" />
          <span className="truncate">
            #{r.id} {r.title}
          </span>
        </button>
      ))}
    </div>
  );
}

function Column({
  icon,
  title,
  count,
  onCreate,
  onAttachToggle,
  attachOpen,
  attachSearch,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  onCreate: () => void;
  onAttachToggle: () => void;
  attachOpen: boolean;
  attachSearch: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <Icon name={icon} size={15} className="text-muted" />
        <span className="text-[13px] font-bold uppercase tracking-wider text-muted">
          {title}
          {count > 0 && ` · ${count}`}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={onAttachToggle}
            className={`flex h-7 w-7 items-center justify-center rounded-full ${attachOpen ? "text-accent-text" : "text-muted hover:text-ink"}`}
            title="Добавить существующую"
          >
            <Icon name="search" size={14} />
          </button>
          <button
            onClick={onCreate}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-ink"
            title="Создать"
          >
            <Icon name="plus" size={15} />
          </button>
        </span>
      </div>
      {attachOpen && attachSearch}
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </div>
  );
}

/* Кнопка «убрать из проекта» на карточке */
function DetachBtn({ onDetach }: { onDetach: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDetach();
      }}
      className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-row hover:text-ink group-hover:flex"
      title="Убрать из проекта (запись не удаляется)"
    >
      <Icon name="x" size={13} />
    </button>
  );
}

export default function ProjectSpace({
  projectId,
  onBack,
  onOpenItem,
  onCreateInProject,
  refreshKey,
}: {
  projectId: number;
  onBack: () => void;
  onOpenItem: (id: number) => void;
  onCreateInProject: (type: "task" | "idea" | "note") => void;
  refreshKey: number;
}) {
  const [project, setProject] = useState<Item | null>(null);
  const [children, setChildren] = useState<Item[] | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [error, setError] = useState("");
  const [attachOpen, setAttachOpen] = useState<"task" | "idea" | "note" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [comment, setComment] = useState("");
  const [editTags, setEditTags] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const titleLoaded = useRef(false);

  const load = useCallback(() => {
    Promise.all([
      api.get<Item>(`/api/items/${projectId}`),
      api.get<Item[]>(`/api/items?project_id=${projectId}`),
    ])
      .then(([p, ch]) => {
        setProject(p);
        setChildren(ch);
        if (!titleLoaded.current) {
          setTitle(p.title ?? "");
          setDescription(p.description ?? "");
          titleLoaded.current = true;
        }
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  useEffect(load, [load, refreshKey]);
  useEffect(() => {
    api.get<Tag[]>("/api/tags").then(setAllTags).catch(() => {});
  }, []);

  async function patch(fields: Record<string, unknown>) {
    await api.patch(`/api/items/${projectId}`, fields);
    load();
  }

  async function detach(id: number) {
    await api.patch(`/api/items/${id}`, { project_id: null });
    load();
  }

  async function toggleTask(t: Item) {
    await api.post(`/api/items/${t.id}/status`, {
      status: t.status === "done" ? "active" : "done",
    });
    load();
  }

  /* Идея → задача проекта: новая задача + архив идеи + связь между ними */
  async function ideaToTask(idea: Item) {
    const task = await api.post<Item>("/api/items", {
      type: "task",
      title: idea.title,
      description: idea.description,
      priority: "medium",
      project_id: projectId,
      tags: idea.tags,
    });
    await api.post(`/api/items/${idea.id}/status`, { status: "archived" });
    await api.post(`/api/items/${task.id}/links`, { other_id: idea.id });
    load();
  }

  async function addComment() {
    if (!comment.trim()) return;
    await api.post(`/api/items/${projectId}/comments`, { text: comment.trim() });
    setComment("");
    load();
  }

  async function removeProject() {
    if (!window.confirm("Удалить проект? Записи останутся, но выпадут из проекта.")) return;
    await api.del(`/api/items/${projectId}`);
    onBack();
  }

  if (error) return <p className="p-6" style={{ color: "var(--red)" }}>{error}</p>;
  if (!project || children === null) return <Spinner />;

  const tasks = children
    .filter((c) => c.type === "task")
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority ?? "medium"] ?? 9) - (PRIORITY_ORDER[b.priority ?? "medium"] ?? 9)
    );
  const activeTasks = tasks.filter((t) => t.status === "active");
  const doneTasks = tasks.filter((t) => t.status !== "active");
  const ideas = children.filter((c) => c.type === "idea" && c.status !== "archived");
  const notes = children.filter((c) => c.type === "note");

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const tone = project.tags[0] ? tagTone(project.tags[0]) : tagTone("работа");

  const attachSearch = (type: "task" | "idea" | "note") => (
    <AttachSearch
      type={type}
      projectId={projectId}
      onDone={() => {
        setAttachOpen(null);
        load();
      }}
      onClose={() => setAttachOpen(null)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Хлебная крошка */}
      <button onClick={onBack} className="flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        ← Проекты
      </button>

      {/* Шапка пространства */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-4">
          <span
            className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: tone.bg, color: tone.fg }}
          >
            <Icon name="folder" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <input
              className="w-full border-none bg-transparent text-[26px] font-extrabold tracking-tight outline-none placeholder:text-muted"
              value={title}
              placeholder="Название проекта"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== (project.title ?? "") && patch({ title })}
            />
            <input
              className="mt-0.5 w-full border-none bg-transparent text-sm text-ink-2 outline-none placeholder:text-muted"
              value={description}
              placeholder="Описание (опционально)…"
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() =>
                description !== (project.description ?? "") && patch({ description })
              }
            />
          </div>
          <button
            onClick={removeProject}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line2 text-muted hover:text-ink"
            title="Удалить проект"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pl-0 sm:pl-16">
          <select
            className="cursor-pointer rounded-full border border-line2 bg-card px-3.5 py-1.5 text-[13px] text-ink-2 outline-none"
            value={project.status ?? "active"}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {PROJECT_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line2 bg-card px-3.5 py-1.5 text-[13px] text-ink-2">
            <Icon name="cal" size={13} className="text-muted" />
            <input
              type="date"
              className="border-none bg-transparent outline-none"
              value={project.deadline ? project.deadline.slice(0, 10) : ""}
              onChange={(e) => patch({ deadline: e.target.value || null })}
            />
          </label>
          {project.tags.map((t) => (
            <TagChip key={t} name={t} />
          ))}
          <button
            onClick={() => setEditTags((v) => !v)}
            className="rounded-lg px-2 py-0.5 text-xs text-muted"
            style={{ border: "1px dashed var(--dashed)" }}
          >
            {editTags ? "готово" : "сферы…"}
          </button>
          {editTags &&
            allTags
              .filter((t) => !project.tags.includes(t.name))
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => patch({ tags: [...project.tags, t.name] })}
                  className="rounded-lg px-2 py-0.5 text-xs capitalize text-muted"
                  style={{ border: "1px dashed var(--dashed)" }}
                >
                  + {t.name}
                </button>
              ))}
          {editTags &&
            project.tags.map((t) => (
              <button
                key={t}
                onClick={() => patch({ tags: project.tags.filter((x) => x !== t) })}
                className="rounded-lg px-2 py-0.5 text-xs capitalize"
                style={{ background: "var(--red-soft)", color: "var(--red)" }}
              >
                − {t}
              </button>
            ))}
          {tasks.length > 0 && (
            <span className="ml-auto flex items-center gap-2.5 text-[12.5px] text-ink-2">
              <span>
                {doneCount} из {tasks.length} задач
              </span>
              <span className="h-2 w-28 overflow-hidden rounded-full bg-row">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${pct}%`, background: tone.fg }}
                />
              </span>
              <span className="font-bold">{pct}%</span>
            </span>
          )}
        </div>
      </div>

      {/* Три колонки (на мобильном — вертикально) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Задачи */}
        <Column
          icon="check"
          title="Задачи"
          count={activeTasks.length}
          onCreate={() => onCreateInProject("task")}
          onAttachToggle={() => setAttachOpen(attachOpen === "task" ? null : "task")}
          attachOpen={attachOpen === "task"}
          attachSearch={attachSearch("task")}
        >
          {activeTasks.length === 0 && doneTasks.length === 0 && (
            <p className="px-1 text-[13px] text-muted">Пока пусто — добавьте первую задачу.</p>
          )}
          {activeTasks.map((t) => {
            const dl = fmtDeadline(t.deadline);
            return (
              <Card key={t.id} onClick={() => onOpenItem(t.id)} className="group relative flex items-start gap-3 p-3.5">
                <CheckCircle done={false} onClick={() => toggleTask(t)} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium leading-snug">{t.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <PriorityChip priority={t.priority} />
                    {dl.text && (
                      <span
                        className="text-[11.5px]"
                        style={{ color: dl.urgent ? "var(--red)" : "var(--muted)" }}
                      >
                        {dl.text}
                      </span>
                    )}
                    {t.tags.slice(0, 2).map((tag) => (
                      <TagChip key={tag} name={tag} />
                    ))}
                  </span>
                </span>
                <DetachBtn onDetach={() => detach(t.id)} />
              </Card>
            );
          })}
          {doneTasks.length > 0 && (
            <div>
              <button
                onClick={() => setShowDone((v) => !v)}
                className="px-1 py-1 text-xs font-semibold text-muted hover:text-ink"
              >
                {showDone ? "▾" : "▸"} Завершённые · {doneTasks.length}
              </button>
              {showDone &&
                doneTasks.map((t) => (
                  <Card
                    key={t.id}
                    onClick={() => onOpenItem(t.id)}
                    className="group relative mb-2 flex items-center gap-3 p-3.5 opacity-55"
                  >
                    <CheckCircle done onClick={() => toggleTask(t)} size={20} />
                    <span className="min-w-0 flex-1 truncate text-[14.5px] line-through">{t.title}</span>
                    <DetachBtn onDetach={() => detach(t.id)} />
                  </Card>
                ))}
            </div>
          )}
        </Column>

        {/* Идеи */}
        <Column
          icon="bulb"
          title="Идеи"
          count={ideas.length}
          onCreate={() => onCreateInProject("idea")}
          onAttachToggle={() => setAttachOpen(attachOpen === "idea" ? null : "idea")}
          attachOpen={attachOpen === "idea"}
          attachSearch={attachSearch("idea")}
        >
          {ideas.length === 0 && (
            <p className="px-1 text-[13px] text-muted">Идей в проекте нет.</p>
          )}
          {ideas.map((i) => (
            <Card key={i.id} onClick={() => onOpenItem(i.id)} className="group relative flex flex-col gap-2 p-4">
              <span className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--amber-soft)", color: "var(--amber)" }}
                >
                  <Icon name="bulb" size={15} />
                </span>
                <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug">{i.title}</span>
              </span>
              {i.description && (
                <span className="line-clamp-2 text-[13px] leading-relaxed text-muted">
                  {i.description}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ideaToTask(i);
                }}
                className="w-fit rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
                title="Создать задачу из идеи (идея уйдёт в архив и останется связанной)"
              >
                → в задачу
              </button>
              <DetachBtn onDetach={() => detach(i.id)} />
            </Card>
          ))}
        </Column>

        {/* Заметки */}
        <Column
          icon="note"
          title="Заметки"
          count={notes.length}
          onCreate={() => onCreateInProject("note")}
          onAttachToggle={() => setAttachOpen(attachOpen === "note" ? null : "note")}
          attachOpen={attachOpen === "note"}
          attachSearch={attachSearch("note")}
        >
          {notes.length === 0 && (
            <p className="px-1 text-[13px] text-muted">Заметок в проекте нет.</p>
          )}
          {notes.map((n) => (
            <Card key={n.id} onClick={() => onOpenItem(n.id)} className="group relative flex flex-col gap-1.5 p-4">
              <span className="text-[14.5px] font-semibold leading-snug">{n.title}</span>
              {(n.note_date || (n.note_recurrence && n.note_recurrence !== "none")) && (
                <span className="flex items-center gap-2">
                  {n.note_date && (
                    <span
                      className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
                    >
                      <Icon name="cal" size={11} />
                      {fmtDate(n.note_date)}
                    </span>
                  )}
                  {n.note_recurrence && n.note_recurrence !== "none" && (
                    <span className="rounded-lg border border-line2 px-2 py-0.5 text-xs text-muted">
                      {RECURRENCE_NAMES[n.note_recurrence]}
                    </span>
                  )}
                </span>
              )}
              {n.description && (
                <span className="line-clamp-2 text-[13px] leading-relaxed text-muted">
                  {n.description}
                </span>
              )}
              <DetachBtn onDetach={() => detach(n.id)} />
            </Card>
          ))}
        </Column>
      </div>

      {/* Хронология проекта */}
      <div className="max-w-[660px]">
        <div className="mb-2.5 text-[13px] font-bold uppercase tracking-wider text-muted">
          Хронология
        </div>
        <div className="flex flex-col gap-3">
          {project.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-avatar text-[10.5px] font-bold text-ink-2">
                Я
              </span>
              <span>
                <span className="block text-[13.5px] leading-relaxed">{c.text}</span>
                <span className="text-xs text-muted">{fmtDateShort(c.created_at)}</span>
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2.5 rounded-full border border-line2 bg-card px-[18px] py-2.5">
            <input
              className="flex-1 border-none bg-transparent text-[13.5px] outline-none placeholder:text-muted"
              placeholder="Добавить комментарий…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addComment()}
            />
            <button onClick={addComment} className="flex text-muted hover:text-ink">
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
