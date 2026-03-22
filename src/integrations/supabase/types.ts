export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_model_versions: {
        Row: {
          base_model: string
          created_at: string
          deployed_at: string | null
          id: string
          improvement_notes: string | null
          progress_pct: number
          status: string
          training_count: number
          user_id: string
          version: string
          vertex_job_id: string | null
        }
        Insert: {
          base_model?: string
          created_at?: string
          deployed_at?: string | null
          id?: string
          improvement_notes?: string | null
          progress_pct?: number
          status?: string
          training_count?: number
          user_id: string
          version: string
          vertex_job_id?: string | null
        }
        Update: {
          base_model?: string
          created_at?: string
          deployed_at?: string | null
          id?: string
          improvement_notes?: string | null
          progress_pct?: number
          status?: string
          training_count?: number
          user_id?: string
          version?: string
          vertex_job_id?: string | null
        }
        Relationships: []
      }
      ai_training_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          model_type: string
          progress_pct: number
          result_endpoint: string | null
          started_at: string | null
          status: string
          training_data_count: number
          training_file_uri: string | null
          training_metrics: Json | null
          user_id: string
          vertex_job_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          model_type?: string
          progress_pct?: number
          result_endpoint?: string | null
          started_at?: string | null
          status?: string
          training_data_count?: number
          training_file_uri?: string | null
          training_metrics?: Json | null
          user_id: string
          vertex_job_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          model_type?: string
          progress_pct?: number
          result_endpoint?: string | null
          started_at?: string | null
          status?: string
          training_data_count?: number
          training_file_uri?: string | null
          training_metrics?: Json | null
          user_id?: string
          vertex_job_name?: string | null
        }
        Relationships: []
      }
      factories: {
        Row: {
          ai_original_data: Json | null
          ai_original_score: number | null
          certifications: string[] | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_wechat: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          description: string | null
          fg_category: string | null
          id: string
          lead_time: string | null
          main_products: string[] | null
          moq: string | null
          name: string
          overall_score: number | null
          platform_score: number | null
          platform_score_detail: Json | null
          recommendation_grade: string | null
          repurchase_rate: number | null
          score_confirmed: boolean
          scraped_data: Json | null
          source_platform: string | null
          source_url: string | null
          status: string | null
          updated_at: string
          user_id: string
          years_on_platform: number | null
        }
        Insert: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          id?: string
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name: string
          overall_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          score_confirmed?: boolean
          scraped_data?: Json | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          years_on_platform?: number | null
        }
        Update: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          id?: string
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string
          overall_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          score_confirmed?: boolean
          scraped_data?: Json | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          years_on_platform?: number | null
        }
        Relationships: []
      }
      factory_notes: {
        Row: {
          content: string
          created_at: string
          factory_id: string
          id: string
          note_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          factory_id: string
          id?: string
          note_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          factory_id?: string
          id?: string
          note_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_notes_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_photos: {
        Row: {
          caption: string | null
          created_at: string
          factory_id: string
          id: string
          photo_type: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          factory_id: string
          id?: string
          photo_type?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          factory_id?: string
          id?: string
          photo_type?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_photos_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_scores: {
        Row: {
          ai_original_score: number | null
          correction_reason: string | null
          created_at: string
          criteria_id: string
          factory_id: string
          id: string
          notes: string | null
          score: number
          updated_at: string
        }
        Insert: {
          ai_original_score?: number | null
          correction_reason?: string | null
          created_at?: string
          criteria_id: string
          factory_id: string
          id?: string
          notes?: string | null
          score?: number
          updated_at?: string
        }
        Update: {
          ai_original_score?: number | null
          correction_reason?: string | null
          created_at?: string
          criteria_id?: string
          factory_id?: string
          id?: string
          notes?: string | null
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_scores_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "scoring_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_scores_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_tags: {
        Row: {
          factory_id: string
          tag_id: string
        }
        Insert: {
          factory_id: string
          tag_id: string
        }
        Update: {
          factory_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_tags_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      fashiongo_queue: {
        Row: {
          created_at: string
          error_message: string | null
          factory_id: string
          id: string
          listed_at: string | null
          min_score_threshold: number | null
          product_data: Json | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          factory_id: string
          id?: string
          listed_at?: string | null
          min_score_threshold?: number | null
          product_data?: Json | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          factory_id?: string
          id?: string
          listed_at?: string | null
          min_score_threshold?: number | null
          product_data?: Json | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fashiongo_queue_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scoring_corrections: {
        Row: {
          ai_score: number
          collected_at: string
          collected_by: string
          corrected_score: number
          criteria_key: string
          diff: number | null
          id: string
          is_valid: boolean
          reason: string
          used_in_version: string | null
          vendor_id: string
        }
        Insert: {
          ai_score: number
          collected_at?: string
          collected_by: string
          corrected_score: number
          criteria_key: string
          diff?: number | null
          id?: string
          is_valid?: boolean
          reason: string
          used_in_version?: string | null
          vendor_id: string
        }
        Update: {
          ai_score?: number
          collected_at?: string
          collected_by?: string
          corrected_score?: number
          criteria_key?: string
          diff?: number | null
          id?: string
          is_valid?: boolean
          reason?: string
          used_in_version?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_corrections_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_criteria: {
        Row: {
          created_at: string
          description: string | null
          id: string
          max_score: number | null
          name: string
          sort_order: number | null
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          max_score?: number | null
          name: string
          sort_order?: number | null
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          max_score?: number | null
          name?: string
          sort_order?: number | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      trend_analyses: {
        Row: {
          created_at: string
          id: string
          source_data: Json | null
          status: string | null
          trend_categories: string[] | null
          trend_keywords: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_data?: Json | null
          status?: string | null
          trend_categories?: string[] | null
          trend_keywords?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_data?: Json | null
          status?: string | null
          trend_categories?: string[] | null
          trend_keywords?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trend_matches: {
        Row: {
          ai_reasoning: string | null
          created_at: string
          factory_id: string
          id: string
          match_score: number | null
          matched_keywords: string[] | null
          status: string | null
          trend_analysis_id: string
          user_id: string
        }
        Insert: {
          ai_reasoning?: string | null
          created_at?: string
          factory_id: string
          id?: string
          match_score?: number | null
          matched_keywords?: string[] | null
          status?: string | null
          trend_analysis_id: string
          user_id: string
        }
        Update: {
          ai_reasoning?: string | null
          created_at?: string
          factory_id?: string
          id?: string
          match_score?: number | null
          matched_keywords?: string[] | null
          status?: string | null
          trend_analysis_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_matches_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_matches_trend_analysis_id_fkey"
            columns: ["trend_analysis_id"]
            isOneToOne: false
            referencedRelation: "trend_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_schedules: {
        Row: {
          created_at: string
          cron_expression: string
          extra_categories: string[] | null
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cron_expression?: string
          extra_categories?: string[] | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cron_expression?: string
          extra_categories?: string[] | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalculate_factory_score: {
        Args: { p_factory_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user" | "viewer"
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
  public: {
    Enums: {
      app_role: ["admin", "user", "viewer"],
    },
  },
} as const
