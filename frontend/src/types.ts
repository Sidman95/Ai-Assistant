export type ItemType = "task" | "idea" | "note" | "project";

export interface Comment {
  id: number;
  text: string;
  created_at: string;
}

export interface AttachmentInfo {
  id: number;
  kind: "image" | "audio";
  has_file: boolean;
  extracted_text: string | null;
  created_at: string;
}

export interface LinkedItem {
  id: number;
  type: ItemType;
  title: string | null;
  status: string | null;
}

export interface Item {
  id: number;
  type: ItemType;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  deadline: string | null;
  delegated_to: string | null;
  note_date: string | null;
  note_recurrence: string | null;
  project_id: number | null;
  project_title: string | null;
  source_text: string | null;
  tags: string[];
  comments: Comment[];
  attachments: AttachmentInfo[];
  links?: LinkedItem[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Tag {
  id: number;
  name: string;
  is_preset: boolean;
}

export interface SettingsData {
  timezone: string;
  morning_report_enabled: boolean;
  morning_report_time: string;
}

export interface DashboardData {
  counts: Record<ItemType, Record<string, number>>;
  done_series: { date: string; done: number }[];
  active_by_tag: { tag: string; count: number }[];
  upcoming: { id: number; title: string; deadline: string; priority: string }[];
  day_report: {
    date: string;
    done_count: number;
    created_count: number;
    active_tasks_total: number;
  };
  plan: {
    date: string;
    tasks_deadline_today: { id: number; title: string; priority: string; overdue?: boolean }[];
    tasks_asap: { id: number; title: string }[];
    notes_today: { id: number; title: string | null; body: string | null }[];
  };
}
