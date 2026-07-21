import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Item, ItemType, Tag } from "./types";
import { Badge, PRIORITY_NAMES, STATUS_NAMES, Spinner, TYPE_ICONS, fmtDate, priorityTone } from "./ui";

const STATUS_OPTIONS: Record<ItemType, string[]> = {
  task: ["active", "done", "cancelled", "delegated"],
  idea: ["active", "archived"],
  note: [],
  project: ["active", "done", "cancelled"],
};

export default function ItemsPage({
  type,
  onOpenItem,
  onCreate,
  refreshKey,
}: {
  type: ItemType;
  onOpenItem: (id: number) => void;
  onCreate: (type: ItemType) => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ type });
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    if (text.trim()) params.set("text", text.trim());
    api
      .get<Item[]>(`/api/items?${params}`)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [type, status, tag, text]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    api.get<Tag[]>("/api/tags").then(setTags).catch(() => {});
  }, []);

  if (error) return <p className="p-6 text-red-700">{error}</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          placeholder="Поиск…"
          className="w-48 rounded border border-hairline bg-surface px-2 py-1.5 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {STATUS_OPTIONS[type].length > 0 && (
          <select
            className="rounded border border-hairline bg-surface px-2 py-1.5 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Все статусы</option>
            {STATUS_OPTIONS[type].map((s) => (
              <option key={s} value={s}>
                {STATUS_NAMES[s]}
              </option>
            ))}
          </select>
        )}
        <select
          className="rounded border border-hairline bg-surface px-2 py-1.5 text-sm"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">Все сферы</option>
          {tags.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => onCreate(type)}
          className="ml-auto rounded bg-accent px-3 py-1.5 text-sm text-white"
        >
          + Создать
        </button>
      </div>

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="p-6 text-center text-muted">Пусто.</p>
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onOpenItem(item.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-page"
              >
                <span>{TYPE_ICONS[item.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <span className="text-muted">#{item.id}</span> {item.title || "(без названия)"}
                  </span>
                  {item.project_title && (
                    <span className="block truncate text-xs text-muted">📁 {item.project_title}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {item.tags.map((t) => (
                    <Badge key={t} tone="blue">
                      {t}
                    </Badge>
                  ))}
                  {item.priority && item.type === "task" && (
                    <Badge tone={priorityTone(item.priority)}>{PRIORITY_NAMES[item.priority]}</Badge>
                  )}
                  {item.deadline && <span className="text-xs text-muted">⏰ {fmtDate(item.deadline)}</span>}
                  {item.note_date && <span className="text-xs text-muted">📅 {fmtDate(item.note_date)}</span>}
                  {item.status && item.status !== "active" && (
                    <Badge tone={item.status === "done" ? "green" : "gray"}>
                      {STATUS_NAMES[item.status] ?? item.status}
                    </Badge>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
