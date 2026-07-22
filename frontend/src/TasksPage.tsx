import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { Item, Tag } from "./types";
import {
  Card,
  CheckCircle,
  PriorityChip,
  PrimaryButton,
  Spinner,
  TagChip,
  fmtDeadline,
} from "./ui";

const PRIORITY_ORDER: Record<string, number> = { asap: 0, high: 1, medium: 2, low: 3 };

function groupTasks(tasks: Item[]) {
  const today: Item[] = [];
  const week: Item[] = [];
  const later: Item[] = [];
  const someday: Item[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const t of tasks) {
    if (!t.deadline) {
      (t.priority === "asap" ? today : someday).push(t);
      continue;
    }
    const d = new Date(t.deadline.slice(0, 10) + "T00:00:00");
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff <= 0) today.push(t);
    else if (diff < 7) week.push(t);
    else later.push(t);
  }
  const byPriority = (a: Item, b: Item) =>
    (PRIORITY_ORDER[a.priority ?? "medium"] ?? 9) - (PRIORITY_ORDER[b.priority ?? "medium"] ?? 9);
  today.sort(byPriority);
  week.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  later.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  someday.sort(byPriority);
  return [
    { label: "Сегодня", items: today, urgent: true },
    { label: "Эта неделя", items: week, urgent: false },
    { label: "Позже", items: later, urgent: false },
    { label: "Без срока", items: someday, urgent: false },
  ].filter((g) => g.items.length > 0);
}

function TaskRow({
  task,
  onOpen,
  onToggle,
}: {
  task: Item;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const done = task.status === "done";
  const dl = fmtDeadline(task.deadline);
  return (
    <div
      onClick={onOpen}
      className={`flex cursor-pointer items-center gap-3.5 px-4 py-3 ${done ? "opacity-55" : ""}`}
    >
      <CheckCircle done={done} onClick={onToggle} />
      <span
        className={`min-w-0 flex-1 truncate text-[15px] font-medium ${done ? "line-through" : ""}`}
      >
        {task.title}
      </span>
      {task.project_title && (
        <span className="hidden items-center gap-1.5 text-[12.5px] text-muted sm:flex">
          <Icon name="folder" size={13} />
          {task.project_title}
        </span>
      )}
      <span className="hidden gap-1.5 sm:flex">
        {task.tags.slice(0, 2).map((t) => (
          <TagChip key={t} name={t} />
        ))}
      </span>
      <PriorityChip priority={done ? null : task.priority} />
      {dl.text && !done && (
        <span
          className="text-[12.5px]"
          style={{ color: dl.urgent ? "var(--red)" : "var(--muted)", fontWeight: dl.urgent ? 600 : 400 }}
        >
          {dl.text}
        </span>
      )}
    </div>
  );
}

export default function TasksPage({
  onOpenItem,
  onCreate,
  refreshKey,
}: {
  onOpenItem: (id: number) => void;
  onCreate: () => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState("active");
  const [tag, setTag] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ type: "task" });
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    if (text.trim()) params.set("text", text.trim());
    api
      .get<Item[]>(`/api/items?${params}`)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [status, tag, text]);

  useEffect(load, [load, refreshKey]);

  useEffect(() => {
    api.get<Tag[]>("/api/tags").then(setTags).catch(() => {});
  }, []);

  async function toggle(task: Item) {
    await api.post(`/api/items/${task.id}/status`, {
      status: task.status === "done" ? "active" : "done",
    });
    load();
  }

  if (error) return <p className="p-6" style={{ color: "var(--red)" }}>{error}</p>;

  const pill =
    "rounded-full border border-line2 bg-card px-4 py-2 text-[13px] text-ink-2 outline-none";

  const grouped = status === "active" && items ? groupTasks(items) : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-extrabold tracking-tight">Задачи</h1>
        <span className="relative ml-0 sm:ml-3">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            placeholder="Поиск по задачам…"
            className={`${pill} w-44 pl-9 placeholder:text-muted`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </span>
        <select className={pill} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Активные</option>
          <option value="done">Завершённые</option>
          <option value="cancelled">Отменённые</option>
          <option value="delegated">Переданные</option>
          <option value="">Все статусы</option>
        </select>
        <select className={pill} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Все сферы</option>
          {tags.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <PrimaryButton onClick={onCreate} icon="plus" className="ml-auto">
          Создать
        </PrimaryButton>
      </div>

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="p-10 text-center text-muted">Ничего не найдено.</p>
      ) : grouped ? (
        grouped.map((g) => (
          <div key={g.label} className="mb-4">
            <div
              className="px-1.5 pb-2.5 pt-1.5 text-xs font-bold uppercase tracking-wider"
              style={{ color: g.urgent ? "var(--red)" : "var(--muted)" }}
            >
              {g.label} · {g.items.length}
            </div>
            <Card className="p-1.5">
              {g.items.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <div className="mx-4 h-px bg-divider" />}
                  <TaskRow task={t} onOpen={() => onOpenItem(t.id)} onToggle={() => toggle(t)} />
                </div>
              ))}
            </Card>
          </div>
        ))
      ) : (
        <Card className="p-1.5">
          {items.map((t, i) => (
            <div key={t.id}>
              {i > 0 && <div className="mx-4 h-px bg-divider" />}
              <TaskRow task={t} onOpen={() => onOpenItem(t.id)} onToggle={() => toggle(t)} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
