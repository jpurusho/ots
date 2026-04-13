export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string | null
          created_at: string | null
          details: string | null
          id: number
          resource_id: string | null
          resource_type: string | null
          user_email: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          details?: string | null
          id?: number
          resource_id?: string | null
          resource_type?: string | null
          user_email?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          details?: string | null
          id?: number
          resource_id?: string | null
          resource_type?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          category: string | null
          data_type: string | null
          description: string | null
          key: string
          label: string | null
          modified_at: string | null
          value: string | null
        }
        Insert: {
          category?: string | null
          data_type?: string | null
          description?: string | null
          key: string
          label?: string | null
          modified_at?: string | null
          value?: string | null
        }
        Update: {
          category?: string | null
          data_type?: string | null
          description?: string | null
          key?: string
          label?: string | null
          modified_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          auth_id: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          last_login: string | null
          name: string | null
          picture: string | null
          role: string | null
        }
        Insert: {
          auth_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          name?: string | null
          picture?: string | null
          role?: string | null
        }
        Update: {
          auth_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          name?: string | null
          picture?: string | null
          role?: string | null
        }
        Relationships: []
      }
      offering_checks: {
        Row: {
          account_number_last4: string | null
          amount: number | null
          bank_name: string | null
          category: string | null
          check_number: string | null
          content_hash: string | null
          created_at: string | null
          id: number
          image_filename: string | null
          memo: string | null
          modified_at: string | null
          offering_id: number | null
          payer_name: string | null
        }
        Insert: {
          account_number_last4?: string | null
          amount?: number | null
          bank_name?: string | null
          category?: string | null
          check_number?: string | null
          content_hash?: string | null
          created_at?: string | null
          id?: number
          image_filename?: string | null
          memo?: string | null
          modified_at?: string | null
          offering_id?: number | null
          payer_name?: string | null
        }
        Update: {
          account_number_last4?: string | null
          amount?: number | null
          bank_name?: string | null
          category?: string | null
          check_number?: string | null
          content_hash?: string | null
          created_at?: string | null
          id?: number
          image_filename?: string | null
          memo?: string | null
          modified_at?: string | null
          offering_id?: number | null
          payer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offering_checks_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          approved_by_email: string | null
          building_fund: number | null
          cash: number | null
          created_at: string | null
          created_by_email: string | null
          date_conf: string | null
          discarded_by_email: string | null
          file_hash: string | null
          filename: string | null
          general: number | null
          id: number
          image_path: string | null
          locked: number | null
          locked_at: string | null
          misc: number | null
          modified_at: string | null
          notes: string | null
          offering_date: string | null
          reviewed_at: string | null
          scan_data: Json | null
          scan_error: string | null
          scanned_at: string | null
          source_type: string | null
          status: string | null
          sunday_school: number | null
        }
        Insert: {
          approved_by_email?: string | null
          building_fund?: number | null
          cash?: number | null
          created_at?: string | null
          created_by_email?: string | null
          date_conf?: string | null
          discarded_by_email?: string | null
          file_hash?: string | null
          filename?: string | null
          general?: number | null
          id?: number
          image_path?: string | null
          locked?: number | null
          locked_at?: string | null
          misc?: number | null
          modified_at?: string | null
          notes?: string | null
          offering_date?: string | null
          reviewed_at?: string | null
          scan_data?: Json | null
          scan_error?: string | null
          scanned_at?: string | null
          source_type?: string | null
          status?: string | null
          sunday_school?: number | null
        }
        Update: {
          approved_by_email?: string | null
          building_fund?: number | null
          cash?: number | null
          created_at?: string | null
          created_by_email?: string | null
          date_conf?: string | null
          discarded_by_email?: string | null
          file_hash?: string | null
          filename?: string | null
          general?: number | null
          id?: number
          image_path?: string | null
          locked?: number | null
          locked_at?: string | null
          misc?: number | null
          modified_at?: string | null
          notes?: string | null
          offering_date?: string | null
          reviewed_at?: string | null
          scan_data?: Json | null
          scan_error?: string | null
          scanned_at?: string | null
          source_type?: string | null
          status?: string | null
          sunday_school?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

