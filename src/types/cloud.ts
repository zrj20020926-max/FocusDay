export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow> & Pick<ProfileRow, 'user_id'>; Update: Partial<ProfileRow>; Relationships: [] }
      tasks: { Row: TaskRow; Insert: Omit<TaskRow, 'created_at' | 'updated_at'> & Partial<Pick<TaskRow, 'created_at' | 'updated_at'>>; Update: Partial<TaskRow>; Relationships: [] }
      categories: { Row: CategoryRow; Insert: Omit<CategoryRow, 'created_at' | 'updated_at'> & Partial<Pick<CategoryRow, 'created_at' | 'updated_at'>>; Update: Partial<CategoryRow>; Relationships: [] }
      focus_sessions: { Row: FocusSessionRow; Insert: Omit<FocusSessionRow, 'created_at' | 'updated_at'> & Partial<Pick<FocusSessionRow, 'created_at' | 'updated_at'>>; Update: Partial<FocusSessionRow>; Relationships: [] }
      timer_states: { Row: TimerStateRow; Insert: Omit<TimerStateRow, 'created_at' | 'updated_at'> & Partial<Pick<TimerStateRow, 'created_at' | 'updated_at'>>; Update: Partial<TimerStateRow>; Relationships: [] }
      user_settings: { Row: UserSettingRow; Insert: Omit<UserSettingRow, 'created_at' | 'updated_at'> & Partial<Pick<UserSettingRow, 'created_at' | 'updated_at'>>; Update: Partial<UserSettingRow>; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: {
      soft_delete_category: { Args: { category_to_delete: string; replacement_category: string }; Returns: boolean }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

interface SyncColumns {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  version: number
}

export interface ProfileRow extends SyncColumns {
  display_name: string | null
  avatar_url: string | null
  timezone: string
}

export interface TaskRow extends SyncColumns {
  title: string
  description: string
  category_id: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED'
  planned_date: string | null
  due_date: string | null
  estimated_duration: number
  estimated_pomodoros: number
  sort_order: number
  completed_at: string | null
}

export interface CategoryRow extends SyncColumns {
  name: string
  color: string
  icon: string
  is_default: boolean
}

export interface FocusSessionRow extends SyncColumns {
  task_id: string | null
  mode: 'POMODORO' | 'STOPWATCH' | 'COUNTDOWN'
  start_time: string
  end_time: string
  duration: number
  status: 'COMPLETED' | 'CANCELLED'
  source_record_id: string | null
  completed_naturally: boolean
  completed_pomodoros: number
}

export interface TimerStateRow extends SyncColumns {
  state: Json
}

export interface UserSettingRow extends SyncColumns {
  key: string
  value: Json
}
