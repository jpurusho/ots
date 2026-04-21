/** Database types — manually maintained to match supabase/migrations/ */

export interface Database {
  public: {
    Tables: {
      offerings: {
        Row: Offering
        Insert: Omit<Offering, 'id' | 'created_at' | 'modified_at'>
        Update: Partial<Omit<Offering, 'id'>>
      }
      offering_checks: {
        Row: OfferingCheck
        Insert: Omit<OfferingCheck, 'id' | 'created_at' | 'modified_at'>
        Update: Partial<Omit<OfferingCheck, 'id'>>
      }
      app_users: {
        Row: AppUser
        Insert: Partial<AppUser> & Pick<AppUser, 'email'>
        Update: Partial<AppUser>
      }
      app_settings: {
        Row: AppSetting
        Insert: AppSetting
        Update: Partial<AppSetting>
      }
      activity_log: {
        Row: ActivityLog
        Insert: Omit<ActivityLog, 'id' | 'created_at'>
        Update: never
      }
    }
    Views: Record<string, never>
    Functions: {
      get_db_stats: {
        Args: Record<string, never>
        Returns: {
          db_size_bytes: number
          tables: Array<{ name: string; rows: number; size_bytes: number }>
          storage_size_bytes: number
          storage_count: number
          auth_user_count: number
        }
      }
    }
    Enums: Record<string, never>
  }
}

export interface Offering {
  id: number
  filename: string | null
  file_hash: string | null
  offering_date: string | null
  date_conf: string | null
  general: number
  cash: number
  sunday_school: number
  building_fund: number
  misc: number
  notes: string | null
  scan_data: Record<string, unknown> | null
  scanned_at: string | null
  scan_error: string | null
  reviewed_at: string | null
  locked: number
  locked_at: string | null
  created_by_email: string | null
  approved_by_email: string | null
  discarded_by_email: string | null
  source_type: string        // 'scanned' | 'manual'
  status: string             // 'pending' | 'uploaded' | 'scanned' | 'scan_error' | 'reviewed' | 'locked' | 'approved' | 'discarded'
  image_path: string | null
  modified_at: string
  created_at: string
}

export interface OfferingCheck {
  id: number
  offering_id: number
  check_number: string | null
  payer_name: string | null
  bank_name: string | null
  account_number_last4: string | null
  memo: string | null
  amount: number | null
  category: string | null
  image_filename: string | null
  content_hash: string | null
  modified_at: string
  created_at: string
}

export interface AppUser {
  id: string
  auth_id: string | null
  email: string
  name: string | null
  picture: string | null
  role: 'admin' | 'operator'
  is_active: boolean
  last_login: string | null
  invite_status: 'none' | 'pending' | 'accepted'
  invited_at: string | null
  invite_env: 'prod' | 'test' | null
  created_at: string
}

export interface AppSetting {
  key: string
  value: string | null
  category: string | null
  data_type: string
  label: string | null
  description: string | null
  modified_at: string
}

export interface ActivityLog {
  id: number
  user_email: string | null
  action: string | null
  resource_type: string | null
  resource_id: string | null
  details: string | null
  created_at: string
}
