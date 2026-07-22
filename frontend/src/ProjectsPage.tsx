import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { Item } from "./types";
import { Card, DashedCreate, PrimaryButton, Spinner, TagChip, fmtDate, tagTone } from "./ui";

export default function ProjectsPage({
  onOpenItem,
  onCreate,
  refreshKey,
}: {
  onOpenItem: (id: number) => void;
  onCreate: () => void;
  refreshKey: number;
}) {
  const [projects, setProjects] = useState<Item[] | null>(null);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    Promise.all([
      api.get<Item[]>("/api/items?type=project"),
      api.get<Item[]>("/api/items?type=task"),
    ])
      .then(([p, t]) => {
        setProjects(p);
        setTasks(t);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load, refreshKey]);

  if (error) return <p className="p-6" style={{ color: "var(--red)" }}>{error}</p>;
  if (projects === null) return <Spinner />;

  const active = projects.filter((p) => p.status === "active");
  const rest = projects.filter((p) => p.status !== "active");
  const ordered = [...active, ...rest];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-extrabold tracking-tight">Проекты</h1>
        <span className="mt-1.5 text-sm text-muted">{active.length} активных</span>
        <PrimaryButton onClick={onCreate} icon="plus" className="ml-auto">
          Создать
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ordered.map((p) => {
          const children = tasks.filter((t) => t.project_id === p.id);
          const done = children.filter((t) => t.status === "done").length;
          const total = children.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const tone = p.tags[0] ? tagTone(p.tags[0]) : tagTone("работа");
          const preview = [
            ...children.filter((t) => t.status === "active").slice(0, 2),
            ...children.filter((t) => t.status === "done").slice(0, 1),
          ];
          return (
            <Card
              key={p.id}
              onClick={() => onOpenItem(p.id)}
              className={`flex flex-col gap-3.5 p-6 ${p.status !== "active" ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-xl"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  <Icon name="folder" size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{p.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">
                    {p.status === "done"
                      ? "завершён"
                      : p.status === "cancelled"
                        ? "отменён"
                        : p.deadline
                          ? `дедлайн ${fmtDate(p.deadline)}`
                          : "без дедлайна"}
                  </span>
                </span>
                {p.tags[0] && <TagChip name={p.tags[0]} />}
              </div>

              {total > 0 && (
                <div>
                  <div className="mb-1.5 flex justify-between text-[12.5px] text-ink-2">
                    <span>
                      {done} из {total} задач
                    </span>
                    <span className="font-bold">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-row">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: tone.fg }}
                    />
                  </div>
                </div>
              )}

              {preview.length > 0 && (
                <div className="flex flex-col gap-2 text-[13.5px] text-ink-2">
                  {preview.map((t) => (
                    <span key={t.id} className="flex items-center gap-2.5">
                      {t.status === "done" ? (
                        <>
                          <span
                            className="flex h-4 w-4 items-center justify-center rounded-full"
                            style={{ background: "var(--green)" }}
                          >
                            <svg width="9" height="9" viewBox="0 0 20 20" style={{ color: "#fff" }}>
                              <path
                                d="M5 10.5l3.2 3L15 6.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <span className="truncate text-muted line-through">{t.title}</span>
                        </>
                      ) : (
                        <>
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{ border: "1.5px solid var(--check)" }}
                          />
                          <span className="truncate">{t.title}</span>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        <DashedCreate label="Новый проект" onClick={onCreate} minHeight={220} />
      </div>
    </div>
  );
}
