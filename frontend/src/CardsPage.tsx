import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { Item, Tag } from "./types";
import { Card, DashedCreate, PrimaryButton, Spinner, TagChip, fmtDate } from "./ui";

const RECURRENCE_NAMES: Record<string, string> = { yearly: "ежегодно", monthly: "ежемесячно" };

export default function CardsPage({
  type,
  onOpenItem,
  onCreate,
  refreshKey,
}: {
  type: "idea" | "note";
  onOpenItem: (id: number) => void;
  onCreate: () => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState(type === "idea" ? "active" : "");
  const [tag, setTag] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ type });
    if (type === "idea" && status) params.set("status", status);
    if (tag) params.set("tag", tag);
    if (text.trim()) params.set("text", text.trim());
    api
      .get<Item[]>(`/api/items?${params}`)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [type, status, tag, text]);

  useEffect(load, [load, refreshKey]);
  useEffect(() => {
    api.get<Tag[]>("/api/tags").then(setTags).catch(() => {});
  }, []);

  if (error) return <p className="p-6" style={{ color: "var(--red)" }}>{error}</p>;

  const title = type === "idea" ? "Идеи" : "Заметки";
  const activeCount = items?.filter((i) => i.status !== "archived").length ?? 0;
  const pill =
    "rounded-full border border-line2 bg-card px-4 py-2 text-[13px] text-ink-2 outline-none";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-extrabold tracking-tight">{title}</h1>
        {items && (
          <span className="mt-1.5 text-sm text-muted">
            {type === "idea" ? `${activeCount} активных` : `${items.length} шт.`}
          </span>
        )}
        <span className="relative ml-0 sm:ml-3">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            placeholder={type === "idea" ? "Поиск по идеям…" : "Поиск по заметкам…"}
            className={`${pill} w-44 pl-9 placeholder:text-muted`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </span>
        {type === "idea" && (
          <select className={pill} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Активные</option>
            <option value="archived">Архив</option>
            <option value="">Все</option>
          </select>
        )}
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
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) =>
            type === "idea" ? (
              <Card key={item.id} onClick={() => onOpenItem(item.id)} className="flex flex-col gap-3 p-5">
                <span
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
                  style={{ background: "var(--amber-soft)", color: "var(--amber)" }}
                >
                  <Icon name="bulb" size={18} />
                </span>
                <span className="text-[15.5px] font-bold leading-snug">{item.title}</span>
                {item.description && (
                  <span className="line-clamp-3 text-[13.5px] leading-relaxed text-muted">
                    {item.description}
                  </span>
                )}
                <span className="mt-auto flex items-center gap-2">
                  {item.tags.slice(0, 2).map((t) => (
                    <TagChip key={t} name={t} />
                  ))}
                  <span className="text-xs text-muted">{fmtDate(item.updated_at)}</span>
                  {item.status === "archived" && (
                    <span className="ml-auto text-xs text-muted">в архиве</span>
                  )}
                </span>
              </Card>
            ) : (
              <Card key={item.id} onClick={() => onOpenItem(item.id)} className="flex flex-col gap-2 p-4">
                <span className="text-[15px] font-semibold">{item.title}</span>
                {(item.note_date || item.note_recurrence) && (
                  <span className="flex items-center gap-2">
                    {item.note_date && (
                      <span
                        className="flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs"
                        style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
                      >
                        <Icon name="cal" size={12} />
                        {fmtDate(item.note_date)}
                      </span>
                    )}
                    {item.note_recurrence && item.note_recurrence !== "none" && (
                      <span className="rounded-lg border border-line2 px-2 py-0.5 text-xs text-muted">
                        {RECURRENCE_NAMES[item.note_recurrence]}
                      </span>
                    )}
                  </span>
                )}
                {item.description && (
                  <span className="line-clamp-3 text-[13px] leading-relaxed text-muted">
                    {item.description}
                  </span>
                )}
                {item.tags.length > 0 && (
                  <span className="mt-1 flex gap-2">
                    {item.tags.slice(0, 3).map((t) => (
                      <TagChip key={t} name={t} />
                    ))}
                  </span>
                )}
              </Card>
            )
          )}
          <DashedCreate
            label={type === "idea" ? "Новая идея" : "Новая заметка"}
            onClick={onCreate}
            minHeight={type === "idea" ? 180 : 120}
          />
        </div>
      )}
    </div>
  );
}
