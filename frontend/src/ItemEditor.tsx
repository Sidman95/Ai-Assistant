import { ReactNode, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { Item, ItemType, Tag } from "./types";
import { STATUS_NAMES, TYPE_ICONS, TYPE_NAMES, TagChip, fmtDateShort, tagTone } from "./ui";

const STATUS_OPTIONS: Record<ItemType, string[]> = {
  task: ["active", "done", "cancelled", "delegated"],
  idea: ["active", "archived"],
  note: [],
  project: ["active", "done", "cancelled"],
};

const STATUS_DOT: Record<string, string> = {
  active: "var(--accent-text)",
  done: "var(--green)",
  cancelled: "var(--muted)",
  delegated: "var(--violet)",
  archived: "var(--muted)",
};

const PRIORITY_COLOR: Record<string, string> = {
  asap: "var(--red)",
  high: "var(--orange)",
  medium: "var(--ink2)",
  low: "var(--muted)",
};

interface Props {
  itemId: number | null; // null => создание
  createType: ItemType;
  onClose: (changed: boolean) => void;
}

/* Строка свойства из макета: подпись слева, контрол справа */
function Row({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div
      className="flex min-h-[44px] items-center gap-2"
      style={{ borderBottom: last ? "none" : "1px solid var(--divider)" }}
    >
      <span className="w-[110px] shrink-0 text-[13px] text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </div>
  );
}

const selectCls =
  "w-full cursor-pointer appearance-none rounded-md border-none bg-transparent py-2 text-sm outline-none";

export default function ItemEditor({ itemId, createType, onClose }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(itemId !== null);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const [tab, setTab] = useState<"comments" | "links" | "files">("comments");

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
  const [addingTag, setAddingTag] = useState(false);
  const [comment, setComment] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<Item[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const type: ItemType = item?.type ?? createType;
  const isNew = itemId === null;

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
      if (isNew) await api.post<Item>("/api/items", body);
      else await api.patch<Item>(`/api/items/${itemId}`, body);
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
    setItemTags((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }

  async function createTag() {
    if (!newTag.trim()) return;
    const t = await api.post<Tag>("/api/tags", { name: newTag.trim() });
    setAllTags((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
    setItemTags((prev) => (prev.includes(t.name) ? prev : [...prev, t.name]));
    setNewTag("");
    setAddingTag(false);
  }

  const linksCount = item?.links?.length ?? 0;
  const filesCount = item?.attachments.length ?? 0;
  const commentsCount = item?.comments.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6"
      style={{ background: "var(--overlay)" }}
      onClick={() => onClose(changed)}
    >
      <div
        className="my-auto flex w-full max-w-[660px] flex-col rounded-[20px] border border-line bg-card"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4 sm:px-7">
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--accent-text)" }}
          >
            <Icon name={TYPE_ICONS[type]} size={13} />
            {isNew ? `Новая: ${TYPE_NAMES[type].toLowerCase()}` : TYPE_NAMES[type]}
          </span>
          {!isNew && <span className="font-mono text-[13px] text-muted">#{itemId}</span>}
          <span className="ml-auto flex items-center gap-2">
            {!isNew && (
              <button
                onClick={remove}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line2 text-muted hover:text-ink"
                title="Удалить"
              >
                <Icon name="trash" size={15} />
              </button>
            )}
            <button
              onClick={save}
              className="rounded-full bg-accent px-[18px] py-2 text-[13px] font-semibold text-white"
            >
              Сохранить
            </button>
            <button
              onClick={() => onClose(changed)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line2 text-muted hover:text-ink"
            >
              <Icon name="x" size={15} />
            </button>
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-muted">Загрузка…</div>
        ) : (
          <div className="flex flex-col gap-4 p-5 sm:p-7">
            {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}

            {/* Заголовок и описание */}
            <div>
              <input
                className="w-full border-none bg-transparent text-[21px] font-bold leading-tight outline-none placeholder:text-muted"
                placeholder={type === "note" ? "Заголовок заметки" : "Суть"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus={isNew}
              />
              <textarea
                className="mt-2 w-full resize-none border-none bg-transparent text-sm leading-relaxed text-ink-2 outline-none placeholder:text-muted"
                placeholder={type === "note" ? "Текст заметки…" : "Описание (опционально)…"}
                rows={description.length > 120 ? 4 : 2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Свойства */}
            <div className="rounded-[14px] border border-line bg-input px-4 py-1">
              {STATUS_OPTIONS[type].length > 0 && (
                <Row label="Статус">
                  <span
                    className="h-[9px] w-[9px] shrink-0 rounded-full"
                    style={{ background: STATUS_DOT[status] }}
                  />
                  <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {STATUS_OPTIONS[type].map((s) => (
                      <option key={s} value={s}>
                        {STATUS_NAMES[s]}
                      </option>
                    ))}
                  </select>
                </Row>
              )}
              {type === "task" && status === "delegated" && (
                <Row label="Кому">
                  <input
                    className={selectCls}
                    placeholder="кому передана…"
                    value={delegatedTo}
                    onChange={(e) => setDelegatedTo(e.target.value)}
                  />
                </Row>
              )}
              {type === "task" && (
                <Row label="Приоритет">
                  <span style={{ color: PRIORITY_COLOR[priority] }} className="flex shrink-0">
                    <Icon name="flag" size={14} />
                  </span>
                  <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="asap">ASAP</option>
                    <option value="high">Высокий</option>
                    <option value="medium">Средний</option>
                    <option value="low">Низкий</option>
                  </select>
                </Row>
              )}
              {(type === "task" || type === "project") && (
                <Row label="Дедлайн">
                  <input
                    type="date"
                    className={selectCls}
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </Row>
              )}
              {type === "note" && (
                <>
                  <Row label="Дата">
                    <input
                      type="date"
                      className={selectCls}
                      value={noteDate}
                      onChange={(e) => setNoteDate(e.target.value)}
                    />
                  </Row>
                  <Row label="Повтор">
                    <select
                      className={selectCls}
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value)}
                    >
                      <option value="none">нет</option>
                      <option value="yearly">ежегодно</option>
                      <option value="monthly">ежемесячно</option>
                    </select>
                  </Row>
                </>
              )}
              {type !== "project" && (
                <Row label="Проект">
                  <select
                    className={selectCls}
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
                </Row>
              )}
              <Row label="Сферы" last>
                <span className="flex flex-wrap items-center gap-1.5 py-2">
                  {allTags
                    .filter((t) => itemTags.includes(t.name))
                    .map((t) => {
                      const tone = tagTone(t.name);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleTag(t.name)}
                          className="rounded-lg px-2.5 py-0.5 text-xs capitalize"
                          style={{ background: tone.bg, color: tone.fg }}
                          title="Убрать сферу"
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  {allTags
                    .filter((t) => !itemTags.includes(t.name))
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(t.name)}
                        className="rounded-lg px-2.5 py-0.5 text-xs capitalize text-muted"
                        style={{ border: "1px dashed var(--dashed)" }}
                      >
                        {t.name}
                      </button>
                    ))}
                  {addingTag ? (
                    <input
                      autoFocus
                      className="w-24 rounded-lg border border-line2 bg-card px-2 py-0.5 text-xs outline-none"
                      value={newTag}
                      placeholder="название"
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createTag()}
                      onBlur={() => {
                        setAddingTag(false);
                        setNewTag("");
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingTag(true)}
                      className="rounded-lg px-2.5 py-0.5 text-xs text-muted"
                      style={{ border: "1px dashed var(--dashed)" }}
                    >
                      + новая
                    </button>
                  )}
                </span>
              </Row>
            </div>

            {/* Исходный текст STT/OCR */}
            {item?.source_text && (
              <details className="rounded-xl border border-line bg-input px-4 py-2.5 text-sm">
                <summary className="cursor-pointer text-[13px] text-muted">
                  Исходный текст (STT/OCR)
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-ink-2">{item.source_text}</p>
              </details>
            )}

            {/* Состав проекта */}
            {item?.type === "project" && <ProjectChildren projectId={item.id} onOpenItem={() => {}} />}

            {/* Табы */}
            {!isNew && item && (
              <>
                <div className="flex gap-5 border-b border-line text-[13.5px]">
                  {(
                    [
                      ["comments", `Хронология${commentsCount ? ` · ${commentsCount}` : ""}`],
                      ["links", `Связи${linksCount ? ` · ${linksCount}` : ""}`],
                      ["files", `Вложения${filesCount ? ` · ${filesCount}` : ""}`],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className="px-0.5 pb-2.5"
                      style={
                        tab === id
                          ? { fontWeight: 700, borderBottom: "2px solid var(--accent-text)" }
                          : { color: "var(--muted)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "comments" && (
                  <div className="flex flex-col gap-3">
                    {item.comments.map((c) => (
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
                    <div className="flex items-center gap-2.5 rounded-full border border-line2 bg-input px-[18px] py-2.5">
                      <input
                        className="flex-1 border-none bg-transparent text-[13.5px] outline-none placeholder:text-muted"
                        placeholder="Добавить комментарий…"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addComment()}
                      />
                      <button onClick={addComment} className="flex text-muted hover:text-ink" title="Отправить">
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {tab === "links" && (
                  <div className="flex flex-col gap-2.5">
                    {(item.links ?? []).length === 0 && (
                      <p className="text-[13px] text-muted">Связей пока нет.</p>
                    )}
                    {(item.links ?? []).map((l) => (
                      <div key={l.id} className="flex items-center gap-2.5 text-sm">
                        <Icon name={TYPE_ICONS[l.type]} size={15} className="shrink-0 text-muted" />
                        <span className="font-mono text-xs text-muted">#{l.id}</span>
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        <button
                          onClick={() => removeLink(l.id)}
                          className="text-xs text-muted hover:text-ink"
                        >
                          убрать
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <span className="relative flex-1">
                        <Icon
                          name="search"
                          size={13}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                        />
                        <input
                          className="w-full rounded-full border border-line2 bg-input py-2 pl-9 pr-4 text-[13px] outline-none placeholder:text-muted"
                          placeholder="найти запись для связи…"
                          value={linkSearch}
                          onChange={(e) => setLinkSearch(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && searchLinks()}
                        />
                      </span>
                      <button
                        onClick={searchLinks}
                        className="rounded-full border border-line2 px-4 py-2 text-[13px] text-ink-2"
                      >
                        Найти
                      </button>
                    </div>
                    {linkResults.length > 0 && (
                      <div className="flex flex-col rounded-xl border border-line bg-input p-1.5">
                        {linkResults.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => addLink(r.id)}
                            className="flex items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-row"
                          >
                            <Icon name="link" size={13} className="shrink-0 text-accent-text" />
                            <Icon name={TYPE_ICONS[r.type]} size={13} className="shrink-0 text-muted" />
                            <span className="truncate">
                              #{r.id} {r.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "files" && (
                  <div className="flex flex-col gap-2.5">
                    {item.attachments.length === 0 && (
                      <p className="text-[13px] text-muted">Вложений пока нет.</p>
                    )}
                    {item.attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2.5 text-sm">
                        <Icon name={a.kind === "image" ? "clip" : "mic"} size={15} className="shrink-0 text-muted" />
                        {a.has_file ? (
                          <a
                            className="text-accent-text underline"
                            href={`/api/attachments/${a.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            открыть файл
                          </a>
                        ) : (
                          <span className="text-muted">только распознанный текст</span>
                        )}
                        <span className="text-xs text-muted">{fmtDateShort(a.created_at)}</span>
                      </div>
                    ))}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,audio/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex w-fit items-center gap-2 rounded-full border border-line2 px-4 py-2 text-[13px] text-ink-2"
                    >
                      <Icon name="clip" size={14} />
                      Прикрепить файл
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectChildren({
  projectId,
}: {
  projectId: number;
  onOpenItem: (id: number) => void;
}) {
  const [children, setChildren] = useState<Item[] | null>(null);

  useEffect(() => {
    api.get<Item[]>(`/api/items?project_id=${projectId}`).then(setChildren).catch(() => {});
  }, [projectId]);

  if (!children || children.length === 0) return null;
  return (
    <div>
      <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted">
        Состав проекта
      </div>
      <div className="flex flex-col gap-2 text-[13.5px] text-ink-2">
        {children.map((c) => (
          <span key={c.id} className="flex items-center gap-2.5">
            <Icon name={TYPE_ICONS[c.type]} size={15} className="shrink-0 text-muted" />
            <span className={`truncate ${c.status === "done" ? "text-muted line-through" : ""}`}>
              {c.title}
            </span>
            {c.tags[0] && <TagChip name={c.tags[0]} />}
          </span>
        ))}
      </div>
    </div>
  );
}
