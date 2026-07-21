import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Item, ItemType, Tag } from "./types";
import { Badge, STATUS_NAMES, Spinner, TYPE_ICONS, TYPE_NAMES, fmtDate } from "./ui";

const STATUS_OPTIONS: Record<ItemType, string[]> = {
  task: ["active", "done", "cancelled", "delegated"],
  idea: ["active", "archived"],
  note: [],
  project: ["active", "done", "cancelled"],
};

interface Props {
  itemId: number | null; // null => создание
  createType: ItemType;
  onClose: (changed: boolean) => void;
}

export default function ItemEditor({ itemId, createType, onClose }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(itemId !== null);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);

  // Поля формы
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("medium");
  const [deadline, setDeadline] = useState("");
  const [delegatedTo, setDelegatedTo] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [projectId, setProjectId] = useState<number | "">("");
  const [itemTags, setItemTags] = useState<string[]>([]);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [projects, setProjects] = useState<Item[]>([]);
  const [newTag, setNewTag] = useState("");
  const [comment, setComment] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<Item[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const type: ItemType = item?.type ?? createType;

  useEffect(() => {
    api.get<Tag[]>("/api/tags").then(setAllTags).catch(() => {});
    api.get<Item[]>("/api/items?type=project&status=active").then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (itemId === null) return;
    api
      .get<Item>(`/api/items/${itemId}`)
      .then((it) => {
        setItem(it);
        setTitle(it.title ?? "");
        setDescription(it.description ?? "");
        setStatus(it.status ?? "active");
        setPriority(it.priority ?? "medium");
        setDeadline(it.deadline ? it.deadline.slice(0, 10) : "");
        setDelegatedTo(it.delegated_to ?? "");
        setNoteDate(it.note_date ?? "");
        setRecurrence(it.note_recurrence ?? "none");
        setProjectId(it.project_id ?? "");
        setItemTags(it.tags);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [itemId]);

  async function save() {
    const body: Record<string, unknown> = {
      type,
      title: title || null,
      description: description || null,
      status: type === "note" ? null : status,
      priority: type === "task" ? priority : null,
      deadline: type === "task" || type === "project" ? deadline || null : null,
      delegated_to: status === "delegated" ? delegatedTo || null : null,
      note_date: type === "note" ? noteDate || null : null,
      note_recurrence: type === "note" ? recurrence : null,
      project_id: projectId === "" ? null : projectId,
      tags: itemTags,
    };
    try {
      if (itemId === null) {
        await api.post<Item>("/api/items", body);
      } else {
        await api.patch<Item>(`/api/items/${itemId}`, body);
      }
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  }

  async function remove() {
    if (itemId === null || !window.confirm("Удалить запись? (мягкое удаление, обратимо)")) return;
    await api.del(`/api/items/${itemId}`);
    onClose(true);
  }

  async function reload() {
    if (itemId === null) return;
    const it = await api.get<Item>(`/api/items/${itemId}`);
    setItem(it);
    setChanged(true);
  }

  async function addComment() {
    if (!comment.trim() || itemId === null) return;
    await api.post(`/api/items/${itemId}/comments`, { text: comment.trim() });
    setComment("");
    await reload();
  }

  async function searchLinks() {
    if (!linkSearch.trim()) return;
    const found = await api.get<Item[]>(`/api/items?text=${encodeURIComponent(linkSearch.trim())}`);
    setLinkResults(found.filter((f) => f.id !== itemId).slice(0, 8));
  }

  async function addLink(otherId: number) {
    if (itemId === null) return;
    await api.post(`/api/items/${itemId}/links`, { other_id: otherId });
    setLinkResults([]);
    setLinkSearch("");
    await reload();
  }

  async function removeLink(otherId: number) {
    if (itemId === null) return;
    await api.del(`/api/items/${itemId}/links/${otherId}`);
    await reload();
  }

  async function uploadFile(file: File) {
    if (itemId === null) return;
    try {
      await api.upload(`/api/items/${itemId}/attachments`, file);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  }

  function toggleTag(name: string) {
    setItemTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  const input = "mt-1 w-full rounded border border-hairline bg-surface px-2 py-1.5 text-sm";
  const label = "mb-2 block text-sm text-ink-2";

  return (
    <div className="fixed inset-0 z-10 flex justify-end bg-black/30" onClick={() => onClose(changed)}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-page p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {TYPE_ICONS[type]} {itemId === null ? `Новая: ${TYPE_NAMES[type]}` : `${TYPE_NAMES[type]} #${itemId}`}
          </h2>
          <button onClick={() => onClose(changed)} className="text-2xl text-muted hover:text-ink">
            ×
          </button>
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <div className="space-y-1">
            {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

            <label className={label}>
              {type === "project" ? "Наименование" : "Суть"}
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className={label}>
              {type === "note" ? "Тело заметки" : "Описание"}
              <textarea
                className={input}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              {STATUS_OPTIONS[type].length > 0 && (
                <label className={label}>
                  Статус
                  <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {STATUS_OPTIONS[type].map((s) => (
                      <option key={s} value={s}>
                        {STATUS_NAMES[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {type === "task" && (
                <label className={label}>
                  Приоритет
                  <select className={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="asap">ASAP</option>
                    <option value="high">высокий</option>
                    <option value="medium">средний</option>
                    <option value="low">низкий</option>
                  </select>
                </label>
              )}
              {(type === "task" || type === "project") && (
                <label className={label}>
                  Дедлайн
                  <input type="date" className={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </label>
              )}
              {type === "task" && status === "delegated" && (
                <label className={label}>
                  Кому передана
                  <input className={input} value={delegatedTo} onChange={(e) => setDelegatedTo(e.target.value)} />
                </label>
              )}
              {type === "note" && (
                <>
                  <label className={label}>
                    Дата (напр. ДР)
                    <input type="date" className={input} value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
                  </label>
                  <label className={label}>
                    Повтор
                    <select className={input} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                      <option value="none">нет</option>
                      <option value="yearly">ежегодно</option>
                      <option value="monthly">ежемесячно</option>
                    </select>
                  </label>
                </>
              )}
              {type !== "project" && (
                <label className={label}>
                  Проект
                  <select
                    className={input}
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">— без проекта —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="pb-2">
              <span className="text-sm text-ink-2">Сферы</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {allTags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={`rounded px-2 py-0.5 text-xs ${
                      itemTags.includes(t.name)
                        ? "bg-accent text-white"
                        : "bg-surface text-ink-2 border border-hairline"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                <input
                  placeholder="+ новая"
                  className="w-20 rounded border border-hairline bg-surface px-1.5 py-0.5 text-xs"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      const t = await api.post<Tag>("/api/tags", { name: newTag.trim() });
                      setAllTags((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
                      setItemTags((prev) => [...prev, t.name]);
                      setNewTag("");
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 pb-4 pt-2">
              <button onClick={save} className="rounded bg-accent px-4 py-1.5 text-sm text-white">
                Сохранить
              </button>
              {itemId !== null && (
                <button onClick={remove} className="rounded border border-hairline px-4 py-1.5 text-sm text-red-700">
                  Удалить
                </button>
              )}
            </div>

            {item && (
              <>
                {item.source_text && (
                  <details className="mb-3 rounded border border-hairline bg-surface p-2 text-sm">
                    <summary className="cursor-pointer text-ink-2">Исходный текст (STT/OCR)</summary>
                    <p className="mt-1 whitespace-pre-wrap text-ink-2">{item.source_text}</p>
                  </details>
                )}

                {/* Проект: состав */}
                {item.type === "project" && <ProjectChildren projectId={item.id} />}

                {/* Связи */}
                <div className="mb-3">
                  <h3 className="mb-1 text-sm font-medium text-ink-2">Связи</h3>
                  {(item.links ?? []).length === 0 && (
                    <p className="text-xs text-muted">Связей нет.</p>
                  )}
                  <ul className="space-y-1">
                    {(item.links ?? []).map((l) => (
                      <li key={l.id} className="flex items-center gap-2 text-sm">
                        <span>
                          {TYPE_ICONS[l.type]} #{l.id} {l.title}
                        </span>
                        <button onClick={() => removeLink(l.id)} className="text-xs text-red-700">
                          убрать
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex gap-1">
                    <input
                      placeholder="найти запись для связи…"
                      className="flex-1 rounded border border-hairline bg-surface px-2 py-1 text-xs"
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchLinks()}
                    />
                    <button onClick={searchLinks} className="rounded border border-hairline px-2 py-1 text-xs">
                      Найти
                    </button>
                  </div>
                  {linkResults.length > 0 && (
                    <ul className="mt-1 space-y-0.5 rounded border border-hairline bg-surface p-1">
                      {linkResults.map((r) => (
                        <li key={r.id}>
                          <button
                            onClick={() => addLink(r.id)}
                            className="w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-page"
                          >
                            🔗 {TYPE_ICONS[r.type]} #{r.id} {r.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Вложения */}
                <div className="mb-3">
                  <h3 className="mb-1 text-sm font-medium text-ink-2">Вложения</h3>
                  <ul className="space-y-1">
                    {item.attachments.map((a) => (
                      <li key={a.id} className="text-sm">
                        {a.kind === "image" ? "🖼" : "🎙"}{" "}
                        {a.has_file ? (
                          <a
                            className="text-accent underline"
                            href={`/api/attachments/${a.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            открыть файл
                          </a>
                        ) : (
                          <span className="text-muted">только распознанный текст</span>
                        )}
                        <span className="ml-1 text-xs text-muted">{fmtDate(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,audio/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="mt-1 rounded border border-hairline px-2 py-1 text-xs"
                  >
                    📎 Прикрепить файл
                  </button>
                </div>

                {/* Комментарии-хронология */}
                <div className="mb-6">
                  <h3 className="mb-1 text-sm font-medium text-ink-2">Хронология (комментарии)</h3>
                  <ul className="space-y-1">
                    {item.comments.map((c) => (
                      <li key={c.id} className="rounded border border-hairline bg-surface p-2 text-sm">
                        <span className="mr-2 text-xs text-muted">{fmtDate(c.created_at)}</span>
                        {c.text}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex gap-1">
                    <input
                      placeholder="добавить комментарий…"
                      className="flex-1 rounded border border-hairline bg-surface px-2 py-1 text-sm"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addComment()}
                    />
                    <button onClick={addComment} className="rounded border border-hairline px-3 py-1 text-sm">
                      +
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectChildren({ projectId }: { projectId: number }) {
  const [children, setChildren] = useState<Item[] | null>(null);

  useEffect(() => {
    api.get<Item[]>(`/api/items?project_id=${projectId}`).then(setChildren).catch(() => {});
  }, [projectId]);

  if (!children || children.length === 0) return null;
  return (
    <div className="mb-3">
      <h3 className="mb-1 text-sm font-medium text-ink-2">Состав проекта</h3>
      <ul className="space-y-1">
        {children.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-sm">
            <span>
              {TYPE_ICONS[c.type]} #{c.id} {c.title}
            </span>
            {c.status && c.status !== "active" && (
              <Badge tone={c.status === "done" ? "green" : "gray"}>{STATUS_NAMES[c.status]}</Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
