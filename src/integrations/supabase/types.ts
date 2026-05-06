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
      ai_capabilities: {
        Row: {
          capability_key: string
          category: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          used_by: string[]
        }
        Insert: {
          capability_key: string
          category: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          used_by?: string[]
        }
        Update: {
          capability_key?: string
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          used_by?: string[]
        }
        Relationships: []
      }
      ai_capability_bindings: {
        Row: {
          capability_key: string
          config: Json
          created_at: string
          id: string
          model_name: string | null
          provider_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capability_key: string
          config?: Json
          created_at?: string
          id?: string
          model_name?: string | null
          provider_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capability_key?: string
          config?: Json
          created_at?: string
          id?: string
          model_name?: string | null
          provider_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_capability_bindings_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: true
            referencedRelation: "ai_capabilities"
            referencedColumns: ["capability_key"]
          },
          {
            foreignKeyName: "ai_capability_bindings_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      ai_model_versions: {
        Row: {
          base_model: string
          created_at: string
          deployed_at: string | null
          id: string
          improvement_notes: string | null
          internal_version: string | null
          is_deleted: boolean | null
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
          internal_version?: string | null
          is_deleted?: boolean | null
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
          internal_version?: string | null
          is_deleted?: boolean | null
          progress_pct?: number
          status?: string
          training_count?: number
          user_id?: string
          version?: string
          vertex_job_id?: string | null
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          category: string
          config: Json
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          is_implemented: boolean
          provider_key: string
          required_secrets: string[]
          updated_at: string
        }
        Insert: {
          category: string
          config?: Json
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          is_implemented?: boolean
          provider_key: string
          required_secrets?: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          config?: Json
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          is_implemented?: boolean
          provider_key?: string
          required_secrets?: string[]
          updated_at?: string
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
          training_snapshot: Json | null
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
          training_snapshot?: Json | null
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
          training_snapshot?: Json | null
          user_id?: string
          vertex_job_name?: string | null
        }
        Relationships: []
      }
      batch_runs: {
        Row: {
          analyzed_count: number | null
          collected_count: number | null
          completed_at: string | null
          created_at: string | null
          embedded_count: number | null
          error_log: Json | null
          failed_count: number | null
          id: string
          status: string
          triggered_by: string
        }
        Insert: {
          analyzed_count?: number | null
          collected_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          embedded_count?: number | null
          error_log?: Json | null
          failed_count?: number | null
          id?: string
          status?: string
          triggered_by?: string
        }
        Update: {
          analyzed_count?: number | null
          collected_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          embedded_count?: number | null
          error_log?: Json | null
          failed_count?: number | null
          id?: string
          status?: string
          triggered_by?: string
        }
        Relationships: []
      }
      buyer_demand_summary: {
        Row: {
          avg_price_interest: number | null
          created_at: string | null
          demand_supply_ratio: number | null
          id: string
          keyword: string | null
          period_end: string | null
          period_start: string | null
          related_trend_ids: string[] | null
          search_count: number | null
          supply_match_count: number | null
          unique_buyers: number | null
        }
        Insert: {
          avg_price_interest?: number | null
          created_at?: string | null
          demand_supply_ratio?: number | null
          id?: string
          keyword?: string | null
          period_end?: string | null
          period_start?: string | null
          related_trend_ids?: string[] | null
          search_count?: number | null
          supply_match_count?: number | null
          unique_buyers?: number | null
        }
        Update: {
          avg_price_interest?: number | null
          created_at?: string | null
          demand_supply_ratio?: number | null
          id?: string
          keyword?: string | null
          period_end?: string | null
          period_start?: string | null
          related_trend_ids?: string[] | null
          search_count?: number | null
          supply_match_count?: number | null
          unique_buyers?: number | null
        }
        Relationships: []
      }
      collection_settings: {
        Row: {
          category_urls: Json | null
          collect_limit: number | null
          created_at: string | null
          hashtags: string[] | null
          id: string
          is_enabled: boolean | null
          keywords: string[] | null
          source_type: string
          updated_at: string | null
        }
        Insert: {
          category_urls?: Json | null
          collect_limit?: number | null
          created_at?: string | null
          hashtags?: string[] | null
          id?: string
          is_enabled?: boolean | null
          keywords?: string[] | null
          source_type: string
          updated_at?: string | null
        }
        Update: {
          category_urls?: Json | null
          collect_limit?: number | null
          created_at?: string | null
          hashtags?: string[] | null
          id?: string
          is_enabled?: boolean | null
          keywords?: string[] | null
          source_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      converted_product_images: {
        Row: {
          converted_image_url: string
          created_at: string
          feedback: string | null
          id: string
          original_image_url: string | null
          product_id: string
          product_name: string
          updated_at: string
          user_id: string
          vendor_key: string
        }
        Insert: {
          converted_image_url: string
          created_at?: string
          feedback?: string | null
          id?: string
          original_image_url?: string | null
          product_id: string
          product_name: string
          updated_at?: string
          user_id: string
          vendor_key: string
        }
        Update: {
          converted_image_url?: string
          created_at?: string
          feedback?: string | null
          id?: string
          original_image_url?: string | null
          product_id?: string
          product_name?: string
          updated_at?: string
          user_id?: string
          vendor_key?: string
        }
        Relationships: []
      }
      dashboard_meta: {
        Row: {
          color: string | null
          description: string | null
          display_order: number | null
          id: string
          label: string | null
          meta_key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          color?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          label?: string | null
          meta_key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          color?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          label?: string | null
          meta_key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      e2e_kpi: {
        Row: {
          current_value: number | null
          direction: string
          id: string
          label: string
          metric_key: string
          sort_order: number
          target_value: number
          unit: string
          updated_at: string | null
        }
        Insert: {
          current_value?: number | null
          direction: string
          id?: string
          label: string
          metric_key: string
          sort_order: number
          target_value: number
          unit: string
          updated_at?: string | null
        }
        Update: {
          current_value?: number | null
          direction?: string
          id?: string
          label?: string
          metric_key?: string
          sort_order?: number
          target_value?: number
          unit?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      e2e_stage_items: {
        Row: {
          content: string
          created_at: string | null
          done: boolean | null
          id: string
          kind: string
          owner_id: string | null
          sort_order: number
          stage_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          done?: boolean | null
          id?: string
          kind: string
          owner_id?: string | null
          sort_order?: number
          stage_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          done?: boolean | null
          id?: string
          kind?: string
          owner_id?: string | null
          sort_order?: number
          stage_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "e2e_stage_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e2e_stage_items_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "e2e_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      e2e_stages: {
        Row: {
          created_at: string | null
          current_state: string | null
          id: string
          intra_track_order: number | null
          owner_id: string | null
          progress_pct: number | null
          sort_order: number
          stage_no: number
          status: string | null
          title: string
          track_id: string | null
          updated_at: string | null
          week_label: string
        }
        Insert: {
          created_at?: string | null
          current_state?: string | null
          id?: string
          intra_track_order?: number | null
          owner_id?: string | null
          progress_pct?: number | null
          sort_order: number
          stage_no: number
          status?: string | null
          title: string
          track_id?: string | null
          updated_at?: string | null
          week_label: string
        }
        Update: {
          created_at?: string | null
          current_state?: string | null
          id?: string
          intra_track_order?: number | null
          owner_id?: string | null
          progress_pct?: number | null
          sort_order?: number
          stage_no?: number
          status?: string | null
          title?: string
          track_id?: string | null
          updated_at?: string | null
          week_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "e2e_stages_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e2e_stages_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "e2e_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      e2e_tracks: {
        Row: {
          color: string
          created_at: string | null
          id: string
          owner_id: string | null
          sort_order: number
          title: string
          track_key: string
          updated_at: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          id?: string
          owner_id?: string | null
          sort_order: number
          title: string
          track_key: string
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          owner_id?: string | null
          sort_order?: number
          title?: string
          track_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "e2e_tracks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      factories: {
        Row: {
          ai_original_data: Json | null
          ai_original_score: number | null
          ai_scored_at: string | null
          alibaba_detected: boolean | null
          alibaba_supplier_id: string | null
          alibaba_url: string | null
          capabilities: string[] | null
          category_ranking: string | null
          certifications: string[] | null
          city: string | null
          contact_email: string | null
          contact_full: Json | null
          contact_name: string | null
          contact_phone: string | null
          contact_wechat: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          description: string | null
          export_years: number | null
          fg_category: string | null
          fg_collab_code: string | null
          fg_collab_note: string | null
          fg_collab_status: string | null
          fg_partner: boolean | null
          gold_supplier_years: number | null
          id: string
          inventory_self_report: number | null
          last_synced_at: string | null
          lead_time: string | null
          main_markets: string[] | null
          main_products: string[] | null
          moq: string | null
          name: string
          name_en: string | null
          offer_id: string | null
          on_time_delivery_rate: number | null
          overall_score: number | null
          p0_completed_at: string | null
          p0_inventory_score: number | null
          p0_price_score: number | null
          p0_us_target_score: number | null
          p1_communication_score: number | null
          p1_crawled_at: string | null
          p1_image_quality_score: number | null
          p1_lead_time_score: number | null
          p1_moq_score: number | null
          p1_self_shipping_score: number | null
          p1_variety_score: number | null
          p3_other_platforms_score: number | null
          platform_ai_summary: string | null
          platform_score: number | null
          platform_score_detail: Json | null
          province: string | null
          raw_business_model: string | null
          raw_crawl_data: Json | null
          raw_dispute_rate: number | null
          raw_employee_count: number | null
          raw_main_category: string | null
          raw_paid_orders_30d: number | null
          raw_product_count: number | null
          raw_response_3min_rate: number | null
          raw_return_rate: number | null
          raw_service_score: number | null
          raw_years_in_business: number | null
          recommendation_grade: string | null
          repurchase_rate: number | null
          response_time_hours: number | null
          review_count: number | null
          review_score: number | null
          reviewer_id: string | null
          score_1st: number | null
          score_confirmed: boolean
          score_status: string | null
          scored_at: string | null
          scoring_reasons: Json | null
          scraped_data: Json | null
          shop_id: string
          source_platform: string | null
          source_platform_default: string | null
          source_url: string | null
          status: string | null
          survey_completed_at: string | null
          sync_status: string | null
          trade_assurance: boolean | null
          transaction_count: number | null
          transaction_volume_usd: number | null
          trend_match_score: number | null
          trend_matched_count: number | null
          trend_score_updated_at: string | null
          updated_at: string
          user_id: string
          verified_by: string | null
          visit_notes: Json | null
          visited_in_person: boolean | null
          years_on_platform: number | null
        }
        Insert: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_supplier_id?: string | null
          alibaba_url?: string | null
          capabilities?: string[] | null
          category_ranking?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_full?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          export_years?: number | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          gold_supplier_years?: number | null
          id?: string
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_markets?: string[] | null
          main_products?: string[] | null
          moq?: string | null
          name: string
          name_en?: string | null
          offer_id?: string | null
          on_time_delivery_rate?: number | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_ai_summary?: string | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_business_model?: string | null
          raw_crawl_data?: Json | null
          raw_dispute_rate?: number | null
          raw_employee_count?: number | null
          raw_main_category?: string | null
          raw_paid_orders_30d?: number | null
          raw_product_count?: number | null
          raw_response_3min_rate?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          response_time_hours?: number | null
          review_count?: number | null
          review_score?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id: string
          source_platform?: string | null
          source_platform_default?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trade_assurance?: boolean | null
          transaction_count?: number | null
          transaction_volume_usd?: number | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string
          user_id: string
          verified_by?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Update: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_supplier_id?: string | null
          alibaba_url?: string | null
          capabilities?: string[] | null
          category_ranking?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_full?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          export_years?: number | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          gold_supplier_years?: number | null
          id?: string
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_markets?: string[] | null
          main_products?: string[] | null
          moq?: string | null
          name?: string
          name_en?: string | null
          offer_id?: string | null
          on_time_delivery_rate?: number | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_ai_summary?: string | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_business_model?: string | null
          raw_crawl_data?: Json | null
          raw_dispute_rate?: number | null
          raw_employee_count?: number | null
          raw_main_category?: string | null
          raw_paid_orders_30d?: number | null
          raw_product_count?: number | null
          raw_response_3min_rate?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          response_time_hours?: number | null
          review_count?: number | null
          review_score?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string
          source_platform?: string | null
          source_platform_default?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trade_assurance?: boolean | null
          transaction_count?: number | null
          transaction_volume_usd?: number | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string
          user_id?: string
          verified_by?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Relationships: []
      }
      factories_backup_20260504: {
        Row: {
          ai_original_data: Json | null
          ai_original_score: number | null
          ai_scored_at: string | null
          alibaba_detected: boolean | null
          alibaba_url: string | null
          certifications: string[] | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_wechat: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_reason: string | null
          description: string | null
          fg_category: string | null
          fg_collab_code: string | null
          fg_collab_note: string | null
          fg_collab_status: string | null
          fg_partner: boolean | null
          id: string | null
          inventory_self_report: number | null
          last_synced_at: string | null
          lead_time: string | null
          main_products: string[] | null
          moq: string | null
          name: string | null
          offer_id: string | null
          overall_score: number | null
          p0_completed_at: string | null
          p0_inventory_score: number | null
          p0_price_score: number | null
          p0_us_target_score: number | null
          p1_communication_score: number | null
          p1_crawled_at: string | null
          p1_image_quality_score: number | null
          p1_lead_time_score: number | null
          p1_moq_score: number | null
          p1_self_shipping_score: number | null
          p1_variety_score: number | null
          p3_other_platforms_score: number | null
          platform_score: number | null
          platform_score_detail: Json | null
          province: string | null
          raw_crawl_data: Json | null
          raw_product_count: number | null
          raw_return_rate: number | null
          raw_service_score: number | null
          raw_years_in_business: number | null
          recommendation_grade: string | null
          repurchase_rate: number | null
          reviewer_id: string | null
          score_1st: number | null
          score_confirmed: boolean | null
          score_status: string | null
          scored_at: string | null
          scoring_reasons: Json | null
          scraped_data: Json | null
          shop_id: string | null
          source_platform: string | null
          source_url: string | null
          status: string | null
          survey_completed_at: string | null
          sync_status: string | null
          trend_match_score: number | null
          trend_matched_count: number | null
          trend_score_updated_at: string | null
          updated_at: string | null
          user_id: string | null
          years_on_platform: number | null
        }
        Insert: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_crawl_data?: Json | null
          raw_product_count?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          years_on_platform?: number | null
        }
        Update: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_crawl_data?: Json | null
          raw_product_count?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          years_on_platform?: number | null
        }
        Relationships: []
      }
      factories_backup_20260504_v2: {
        Row: {
          ai_original_data: Json | null
          ai_original_score: number | null
          ai_scored_at: string | null
          alibaba_detected: boolean | null
          alibaba_url: string | null
          certifications: string[] | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_wechat: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_reason: string | null
          description: string | null
          fg_category: string | null
          fg_collab_code: string | null
          fg_collab_note: string | null
          fg_collab_status: string | null
          fg_partner: boolean | null
          id: string | null
          inventory_self_report: number | null
          last_synced_at: string | null
          lead_time: string | null
          main_products: string[] | null
          moq: string | null
          name: string | null
          offer_id: string | null
          overall_score: number | null
          p0_completed_at: string | null
          p0_inventory_score: number | null
          p0_price_score: number | null
          p0_us_target_score: number | null
          p1_communication_score: number | null
          p1_crawled_at: string | null
          p1_image_quality_score: number | null
          p1_lead_time_score: number | null
          p1_moq_score: number | null
          p1_self_shipping_score: number | null
          p1_variety_score: number | null
          p3_other_platforms_score: number | null
          platform_score: number | null
          platform_score_detail: Json | null
          province: string | null
          raw_crawl_data: Json | null
          raw_product_count: number | null
          raw_return_rate: number | null
          raw_service_score: number | null
          raw_years_in_business: number | null
          recommendation_grade: string | null
          repurchase_rate: number | null
          reviewer_id: string | null
          score_1st: number | null
          score_confirmed: boolean | null
          score_status: string | null
          scored_at: string | null
          scoring_reasons: Json | null
          scraped_data: Json | null
          shop_id: string | null
          source_platform: string | null
          source_url: string | null
          status: string | null
          survey_completed_at: string | null
          sync_status: string | null
          trend_match_score: number | null
          trend_matched_count: number | null
          trend_score_updated_at: string | null
          updated_at: string | null
          user_id: string | null
          visit_notes: Json | null
          visited_in_person: boolean | null
          years_on_platform: number | null
        }
        Insert: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_crawl_data?: Json | null
          raw_product_count?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Update: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_crawl_data?: Json | null
          raw_product_count?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Relationships: []
      }
      factories_backup_alibaba_pivot: {
        Row: {
          ai_original_data: Json | null
          ai_original_score: number | null
          ai_scored_at: string | null
          alibaba_detected: boolean | null
          alibaba_url: string | null
          certifications: string[] | null
          city: string | null
          contact_email: string | null
          contact_full: Json | null
          contact_name: string | null
          contact_phone: string | null
          contact_wechat: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_reason: string | null
          description: string | null
          fg_category: string | null
          fg_collab_code: string | null
          fg_collab_note: string | null
          fg_collab_status: string | null
          fg_partner: boolean | null
          id: string | null
          inventory_self_report: number | null
          last_synced_at: string | null
          lead_time: string | null
          main_products: string[] | null
          moq: string | null
          name: string | null
          name_en: string | null
          offer_id: string | null
          overall_score: number | null
          p0_completed_at: string | null
          p0_inventory_score: number | null
          p0_price_score: number | null
          p0_us_target_score: number | null
          p1_communication_score: number | null
          p1_crawled_at: string | null
          p1_image_quality_score: number | null
          p1_lead_time_score: number | null
          p1_moq_score: number | null
          p1_self_shipping_score: number | null
          p1_variety_score: number | null
          p3_other_platforms_score: number | null
          platform_ai_summary: string | null
          platform_score: number | null
          platform_score_detail: Json | null
          province: string | null
          raw_business_model: string | null
          raw_crawl_data: Json | null
          raw_dispute_rate: number | null
          raw_employee_count: number | null
          raw_main_category: string | null
          raw_paid_orders_30d: number | null
          raw_product_count: number | null
          raw_response_3min_rate: number | null
          raw_return_rate: number | null
          raw_service_score: number | null
          raw_years_in_business: number | null
          recommendation_grade: string | null
          repurchase_rate: number | null
          reviewer_id: string | null
          score_1st: number | null
          score_confirmed: boolean | null
          score_status: string | null
          scored_at: string | null
          scoring_reasons: Json | null
          scraped_data: Json | null
          shop_id: string | null
          source_platform: string | null
          source_url: string | null
          status: string | null
          survey_completed_at: string | null
          sync_status: string | null
          trend_match_score: number | null
          trend_matched_count: number | null
          trend_score_updated_at: string | null
          updated_at: string | null
          user_id: string | null
          visit_notes: Json | null
          visited_in_person: boolean | null
          years_on_platform: number | null
        }
        Insert: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_full?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          name_en?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_ai_summary?: string | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_business_model?: string | null
          raw_crawl_data?: Json | null
          raw_dispute_rate?: number | null
          raw_employee_count?: number | null
          raw_main_category?: string | null
          raw_paid_orders_30d?: number | null
          raw_product_count?: number | null
          raw_response_3min_rate?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Update: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_full?: Json | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          name_en?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_ai_summary?: string | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_business_model?: string | null
          raw_crawl_data?: Json | null
          raw_dispute_rate?: number | null
          raw_employee_count?: number | null
          raw_main_category?: string | null
          raw_paid_orders_30d?: number | null
          raw_product_count?: number | null
          raw_response_3min_rate?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Relationships: []
      }
      factories_backup_v3: {
        Row: {
          ai_original_data: Json | null
          ai_original_score: number | null
          ai_scored_at: string | null
          alibaba_detected: boolean | null
          alibaba_url: string | null
          certifications: string[] | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_wechat: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_reason: string | null
          description: string | null
          fg_category: string | null
          fg_collab_code: string | null
          fg_collab_note: string | null
          fg_collab_status: string | null
          fg_partner: boolean | null
          id: string | null
          inventory_self_report: number | null
          last_synced_at: string | null
          lead_time: string | null
          main_products: string[] | null
          moq: string | null
          name: string | null
          offer_id: string | null
          overall_score: number | null
          p0_completed_at: string | null
          p0_inventory_score: number | null
          p0_price_score: number | null
          p0_us_target_score: number | null
          p1_communication_score: number | null
          p1_crawled_at: string | null
          p1_image_quality_score: number | null
          p1_lead_time_score: number | null
          p1_moq_score: number | null
          p1_self_shipping_score: number | null
          p1_variety_score: number | null
          p3_other_platforms_score: number | null
          platform_score: number | null
          platform_score_detail: Json | null
          province: string | null
          raw_crawl_data: Json | null
          raw_product_count: number | null
          raw_return_rate: number | null
          raw_service_score: number | null
          raw_years_in_business: number | null
          recommendation_grade: string | null
          repurchase_rate: number | null
          reviewer_id: string | null
          score_1st: number | null
          score_confirmed: boolean | null
          score_status: string | null
          scored_at: string | null
          scoring_reasons: Json | null
          scraped_data: Json | null
          shop_id: string | null
          source_platform: string | null
          source_url: string | null
          status: string | null
          survey_completed_at: string | null
          sync_status: string | null
          trend_match_score: number | null
          trend_matched_count: number | null
          trend_score_updated_at: string | null
          updated_at: string | null
          user_id: string | null
          visit_notes: Json | null
          visited_in_person: boolean | null
          years_on_platform: number | null
        }
        Insert: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_crawl_data?: Json | null
          raw_product_count?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Update: {
          ai_original_data?: Json | null
          ai_original_score?: number | null
          ai_scored_at?: string | null
          alibaba_detected?: boolean | null
          alibaba_url?: string | null
          certifications?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_wechat?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          fg_category?: string | null
          fg_collab_code?: string | null
          fg_collab_note?: string | null
          fg_collab_status?: string | null
          fg_partner?: boolean | null
          id?: string | null
          inventory_self_report?: number | null
          last_synced_at?: string | null
          lead_time?: string | null
          main_products?: string[] | null
          moq?: string | null
          name?: string | null
          offer_id?: string | null
          overall_score?: number | null
          p0_completed_at?: string | null
          p0_inventory_score?: number | null
          p0_price_score?: number | null
          p0_us_target_score?: number | null
          p1_communication_score?: number | null
          p1_crawled_at?: string | null
          p1_image_quality_score?: number | null
          p1_lead_time_score?: number | null
          p1_moq_score?: number | null
          p1_self_shipping_score?: number | null
          p1_variety_score?: number | null
          p3_other_platforms_score?: number | null
          platform_score?: number | null
          platform_score_detail?: Json | null
          province?: string | null
          raw_crawl_data?: Json | null
          raw_product_count?: number | null
          raw_return_rate?: number | null
          raw_service_score?: number | null
          raw_years_in_business?: number | null
          recommendation_grade?: string | null
          repurchase_rate?: number | null
          reviewer_id?: string | null
          score_1st?: number | null
          score_confirmed?: boolean | null
          score_status?: string | null
          scored_at?: string | null
          scoring_reasons?: Json | null
          scraped_data?: Json | null
          shop_id?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string | null
          survey_completed_at?: string | null
          sync_status?: string | null
          trend_match_score?: number | null
          trend_matched_count?: number | null
          trend_score_updated_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          visit_notes?: Json | null
          visited_in_person?: boolean | null
          years_on_platform?: number | null
        }
        Relationships: []
      }
      factory_logs: {
        Row: {
          created_at: string
          created_by: string
          event_data: Json
          event_message: string
          event_type: string
          factory_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          event_data?: Json
          event_message: string
          event_type: string
          factory_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_data?: Json
          event_message?: string
          event_type?: string
          factory_id?: string
          id?: string
          user_id?: string
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
      fg_buyer_signals: {
        Row: {
          category_interest: string | null
          count: number
          created_at: string
          id: string
          keyword: string | null
          price_range: Json | null
          product_category: string | null
          search_query: string | null
          session_id: string | null
          signal_date: string
          signal_type: string
          source_data: Json
          trend_id: string | null
          user_id: string
        }
        Insert: {
          category_interest?: string | null
          count?: number
          created_at?: string
          id?: string
          keyword?: string | null
          price_range?: Json | null
          product_category?: string | null
          search_query?: string | null
          session_id?: string | null
          signal_date?: string
          signal_type: string
          source_data?: Json
          trend_id?: string | null
          user_id: string
        }
        Update: {
          category_interest?: string | null
          count?: number
          created_at?: string
          id?: string
          keyword?: string | null
          price_range?: Json | null
          product_category?: string | null
          search_query?: string | null
          session_id?: string | null
          signal_date?: string
          signal_type?: string
          source_data?: Json
          trend_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fg_registered_products: {
        Row: {
          activated_at: string | null
          category_id: number | null
          color_id: number | null
          created_at: string | null
          error_message: string | null
          fg_product_id: number
          id: string
          image_url: string | null
          item_name: string
          registered_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          style_no: string | null
          unit_price: number | null
          updated_at: string | null
          user_id: string | null
          vendor_key: string
          wholesaler_id: number
        }
        Insert: {
          activated_at?: string | null
          category_id?: number | null
          color_id?: number | null
          created_at?: string | null
          error_message?: string | null
          fg_product_id: number
          id?: string
          image_url?: string | null
          item_name: string
          registered_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          style_no?: string | null
          unit_price?: number | null
          updated_at?: string | null
          user_id?: string | null
          vendor_key: string
          wholesaler_id: number
        }
        Update: {
          activated_at?: string | null
          category_id?: number | null
          color_id?: number | null
          created_at?: string | null
          error_message?: string | null
          fg_product_id?: number
          id?: string
          image_url?: string | null
          item_name?: string
          registered_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          style_no?: string | null
          unit_price?: number | null
          updated_at?: string | null
          user_id?: string | null
          vendor_key?: string
          wholesaler_id?: number
        }
        Relationships: []
      }
      fg_settings: {
        Row: {
          created_at: string | null
          id: string
          settings: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          settings?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          settings?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      filter_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters: Json
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      manual_crawl_queue: {
        Row: {
          attempted_at: string
          created_at: string
          failure_reason: string | null
          id: string
          resolved_factory_id: string | null
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          attempted_at?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          resolved_factory_id?: string | null
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          attempted_at?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          resolved_factory_id?: string | null
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_crawl_queue_resolved_factory_id_fkey"
            columns: ["resolved_factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      match_feedback: {
        Row: {
          created_at: string | null
          feedback_note: string | null
          id: string
          is_relevant: boolean
          product_id: string | null
          trend_id: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_note?: string | null
          id?: string
          is_relevant: boolean
          product_id?: string | null
          trend_id?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_note?: string | null
          id?: string
          is_relevant?: boolean
          product_id?: string | null
          trend_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_feedback_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sourceable_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_feedback_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trend_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_logs: {
        Row: {
          created_at: string
          created_by: string
          event_data: Json | null
          event_message: string
          event_type: string
          factory_id: string | null
          id: string
          product_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          event_data?: Json | null
          event_message: string
          event_type: string
          factory_id?: string | null
          id?: string
          product_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_data?: Json | null
          event_message?: string
          event_type?: string
          factory_id?: string | null
          id?: string
          product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_logs_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number | null
          search_source_image_url: string | null
          search_source_query: string | null
          search_source_type: string | null
          source_crawled_at: string | null
          source_factory_id: string | null
          source_factory_name: string | null
          source_images: string[] | null
          source_platform: string | null
          source_price: number | null
          source_price_currency: string | null
          source_product_name: string | null
          source_product_url: string | null
          source_raw_data: Json | null
          user_id: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number | null
          search_source_image_url?: string | null
          search_source_query?: string | null
          search_source_type?: string | null
          source_crawled_at?: string | null
          source_factory_id?: string | null
          source_factory_name?: string | null
          source_images?: string[] | null
          source_platform?: string | null
          source_price?: number | null
          source_price_currency?: string | null
          source_product_name?: string | null
          source_product_url?: string | null
          source_raw_data?: Json | null
          user_id?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number | null
          search_source_image_url?: string | null
          search_source_query?: string | null
          search_source_type?: string | null
          source_crawled_at?: string | null
          source_factory_id?: string | null
          source_factory_name?: string | null
          source_images?: string[] | null
          source_platform?: string | null
          source_price?: number | null
          source_price_currency?: string | null
          source_product_name?: string | null
          source_product_url?: string | null
          source_raw_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_source_factory_id_fkey"
            columns: ["source_factory_id"]
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
      project_items: {
        Row: {
          assignee_id: string | null
          category: string
          content: string
          created_at: string | null
          display_order: number | null
          id: string
          project_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          category: string
          content: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          project_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          category?: string
          content?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          deadlines: string | null
          display_order: number
          id: string
          name: string
          notes: string | null
          number_label: string | null
          owner_id: string | null
          phase: string | null
          progress: number | null
          status_color: string | null
          tag: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deadlines?: string | null
          display_order?: number
          id?: string
          name: string
          notes?: string | null
          number_label?: string | null
          owner_id?: string | null
          phase?: string | null
          progress?: number | null
          status_color?: string | null
          tag?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deadlines?: string | null
          display_order?: number
          id?: string
          name?: string
          notes?: string | null
          number_label?: string | null
          owner_id?: string | null
          phase?: string | null
          progress?: number | null
          status_color?: string | null
          tag?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
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
          is_learned: boolean
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
          is_learned?: boolean
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
          is_learned?: boolean
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
      sourceable_products: {
        Row: {
          category: string | null
          color_size: string | null
          created_at: string
          currency: string | null
          description: string | null
          description_generated_at: string | null
          description_source: string
          detected_colors: string[] | null
          detected_material: string | null
          detected_style: string | null
          embedding: string | null
          factory_id: string | null
          fg_category: string | null
          id: string
          image_description: string | null
          image_embedding: string | null
          image_url: string | null
          images: string[] | null
          is_uploaded: boolean | null
          item_name: string | null
          item_name_en: string | null
          material: string | null
          notes: string | null
          options: Json | null
          price: number | null
          product_no: string | null
          purchase_link: string | null
          size_chart: string | null
          source: string
          source_url: string | null
          status: string
          style_no: string | null
          trend_analysis_id: string | null
          unit_price: number | null
          unit_price_usd: number | null
          updated_at: string
          user_id: string | null
          vendor_name: string | null
          weight: number | null
          weight_kg: number | null
        }
        Insert: {
          category?: string | null
          color_size?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_generated_at?: string | null
          description_source?: string
          detected_colors?: string[] | null
          detected_material?: string | null
          detected_style?: string | null
          embedding?: string | null
          factory_id?: string | null
          fg_category?: string | null
          id?: string
          image_description?: string | null
          image_embedding?: string | null
          image_url?: string | null
          images?: string[] | null
          is_uploaded?: boolean | null
          item_name?: string | null
          item_name_en?: string | null
          material?: string | null
          notes?: string | null
          options?: Json | null
          price?: number | null
          product_no?: string | null
          purchase_link?: string | null
          size_chart?: string | null
          source?: string
          source_url?: string | null
          status?: string
          style_no?: string | null
          trend_analysis_id?: string | null
          unit_price?: number | null
          unit_price_usd?: number | null
          updated_at?: string
          user_id?: string | null
          vendor_name?: string | null
          weight?: number | null
          weight_kg?: number | null
        }
        Update: {
          category?: string | null
          color_size?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_generated_at?: string | null
          description_source?: string
          detected_colors?: string[] | null
          detected_material?: string | null
          detected_style?: string | null
          embedding?: string | null
          factory_id?: string | null
          fg_category?: string | null
          id?: string
          image_description?: string | null
          image_embedding?: string | null
          image_url?: string | null
          images?: string[] | null
          is_uploaded?: boolean | null
          item_name?: string | null
          item_name_en?: string | null
          material?: string | null
          notes?: string | null
          options?: Json | null
          price?: number | null
          product_no?: string | null
          purchase_link?: string | null
          size_chart?: string | null
          source?: string
          source_url?: string | null
          status?: string
          style_no?: string | null
          trend_analysis_id?: string | null
          unit_price?: number | null
          unit_price_usd?: number | null
          updated_at?: string
          user_id?: string | null
          vendor_name?: string | null
          weight?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sourceable_products_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourceable_products_trend_analysis_id_fkey"
            columns: ["trend_analysis_id"]
            isOneToOne: false
            referencedRelation: "trend_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_reports: {
        Row: {
          created_at: string | null
          generated_at: string | null
          id: string
          period_days: number
          report_data: Json
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          generated_at?: string | null
          id?: string
          period_days?: number
          report_data?: Json
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          generated_at?: string | null
          id?: string
          period_days?: number
          report_data?: Json
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sourcing_target_products: {
        Row: {
          category: string | null
          created_at: string
          fg_category: string | null
          id: string
          image_url: string | null
          item_name: string
          item_name_en: string | null
          notes: string | null
          options: Json | null
          source: string
          source_url: string | null
          status: string
          style_no: string | null
          unit_price: number | null
          unit_price_usd: number | null
          updated_at: string
          user_id: string
          vendor_name: string | null
          weight: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          fg_category?: string | null
          id?: string
          image_url?: string | null
          item_name: string
          item_name_en?: string | null
          notes?: string | null
          options?: Json | null
          source?: string
          source_url?: string | null
          status?: string
          style_no?: string | null
          unit_price?: number | null
          unit_price_usd?: number | null
          updated_at?: string
          user_id: string
          vendor_name?: string | null
          weight?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          fg_category?: string | null
          id?: string
          image_url?: string | null
          item_name?: string
          item_name_en?: string | null
          notes?: string | null
          options?: Json | null
          source?: string
          source_url?: string | null
          status?: string
          style_no?: string | null
          unit_price?: number | null
          unit_price_usd?: number | null
          updated_at?: string
          user_id?: string
          vendor_name?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      style_taxonomy: {
        Row: {
          category: string
          color_hex: string | null
          created_at: string | null
          icon_emoji: string | null
          id: string
          keywords: string[] | null
          sort_order: number | null
          style_tag: string
          style_tag_kr: string | null
        }
        Insert: {
          category: string
          color_hex?: string | null
          created_at?: string | null
          icon_emoji?: string | null
          id?: string
          keywords?: string[] | null
          sort_order?: number | null
          style_tag: string
          style_tag_kr?: string | null
        }
        Update: {
          category?: string
          color_hex?: string | null
          created_at?: string | null
          icon_emoji?: string | null
          id?: string
          keywords?: string[] | null
          sort_order?: number | null
          style_tag?: string
          style_tag_kr?: string | null
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
      team_members: {
        Row: {
          color: string | null
          created_at: string | null
          display_order: number | null
          emoji: string | null
          id: string
          name: string
          role: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          emoji?: string | null
          id?: string
          name: string
          role?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          emoji?: string | null
          id?: string
          name?: string
          role?: string | null
        }
        Relationships: []
      }
      trend_analyses: {
        Row: {
          cluster_id: string | null
          created_at: string
          embedding: string | null
          engagement_rate: number | null
          first_seen_at: string | null
          id: string
          image_embedding: string | null
          lifecycle_stage: string | null
          platform_count: number | null
          primary_category: string | null
          signal_factors: Json | null
          signal_score: number | null
          source_data: Json | null
          source_engagement: Json | null
          source_followers: number | null
          status: string | null
          style_tags: string[] | null
          supply_gap_score: number | null
          trend_categories: string[] | null
          trend_keywords: string[]
          updated_at: string
          user_id: string
          velocity: number | null
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          embedding?: string | null
          engagement_rate?: number | null
          first_seen_at?: string | null
          id?: string
          image_embedding?: string | null
          lifecycle_stage?: string | null
          platform_count?: number | null
          primary_category?: string | null
          signal_factors?: Json | null
          signal_score?: number | null
          source_data?: Json | null
          source_engagement?: Json | null
          source_followers?: number | null
          status?: string | null
          style_tags?: string[] | null
          supply_gap_score?: number | null
          trend_categories?: string[] | null
          trend_keywords?: string[]
          updated_at?: string
          user_id: string
          velocity?: number | null
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          embedding?: string | null
          engagement_rate?: number | null
          first_seen_at?: string | null
          id?: string
          image_embedding?: string | null
          lifecycle_stage?: string | null
          platform_count?: number | null
          primary_category?: string | null
          signal_factors?: Json | null
          signal_score?: number | null
          source_data?: Json | null
          source_engagement?: Json | null
          source_followers?: number | null
          status?: string | null
          style_tags?: string[] | null
          supply_gap_score?: number | null
          trend_categories?: string[] | null
          trend_keywords?: string[]
          updated_at?: string
          user_id?: string
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cluster"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "trend_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_backprop_runs: {
        Row: {
          created_at: string
          factories_updated: number
          id: string
          min_similarity: number
          period_days: number
          triggered_by: string
        }
        Insert: {
          created_at?: string
          factories_updated?: number
          id?: string
          min_similarity?: number
          period_days?: number
          triggered_by?: string
        }
        Update: {
          created_at?: string
          factories_updated?: number
          id?: string
          min_similarity?: number
          period_days?: number
          triggered_by?: string
        }
        Relationships: []
      }
      trend_cluster_members: {
        Row: {
          cluster_id: string
          similarity_score: number | null
          trend_id: string
        }
        Insert: {
          cluster_id: string
          similarity_score?: number | null
          trend_id: string
        }
        Update: {
          cluster_id?: string
          similarity_score?: number | null
          trend_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_cluster_members_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "trend_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_cluster_members_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trend_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_clusters: {
        Row: {
          avg_engagement_rate: number | null
          avg_signal_score: number | null
          cluster_name: string
          cluster_name_kr: string | null
          created_at: string | null
          description: string | null
          id: string
          platform_count: number | null
          platforms: string[] | null
          representative_image_url: string | null
          style_tags: string[] | null
          trend_count: number | null
          updated_at: string | null
          weekly_growth_rate: number | null
        }
        Insert: {
          avg_engagement_rate?: number | null
          avg_signal_score?: number | null
          cluster_name: string
          cluster_name_kr?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          platform_count?: number | null
          platforms?: string[] | null
          representative_image_url?: string | null
          style_tags?: string[] | null
          trend_count?: number | null
          updated_at?: string | null
          weekly_growth_rate?: number | null
        }
        Update: {
          avg_engagement_rate?: number | null
          avg_signal_score?: number | null
          cluster_name?: string
          cluster_name_kr?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          platform_count?: number | null
          platforms?: string[] | null
          representative_image_url?: string | null
          style_tags?: string[] | null
          trend_count?: number | null
          updated_at?: string | null
          weekly_growth_rate?: number | null
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
      trend_source_profiles: {
        Row: {
          account_name: string
          account_url: string | null
          avg_engagement_rate: number | null
          created_at: string | null
          followers: number | null
          id: string
          last_collected_at: string | null
          platform: string
          reliability_score: number | null
          total_trends_found: number | null
        }
        Insert: {
          account_name: string
          account_url?: string | null
          avg_engagement_rate?: number | null
          created_at?: string | null
          followers?: number | null
          id?: string
          last_collected_at?: string | null
          platform: string
          reliability_score?: number | null
          total_trends_found?: number | null
        }
        Update: {
          account_name?: string
          account_url?: string | null
          avg_engagement_rate?: number | null
          created_at?: string | null
          followers?: number | null
          id?: string
          last_collected_at?: string | null
          platform?: string
          reliability_score?: number | null
          total_trends_found?: number | null
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
      vendor_model_settings: {
        Row: {
          body_type: string
          created_at: string | null
          ethnicity: string
          gender: string
          id: string
          model_image_url: string | null
          pose: string
          updated_at: string | null
          user_id: string
          vendor_id: string
        }
        Insert: {
          body_type?: string
          created_at?: string | null
          ethnicity?: string
          gender?: string
          id?: string
          model_image_url?: string | null
          pose?: string
          updated_at?: string | null
          user_id: string
          vendor_id: string
        }
        Update: {
          body_type?: string
          created_at?: string | null
          ethnicity?: string
          gender?: string
          id?: string
          model_image_url?: string | null
          pose?: string
          updated_at?: string | null
          user_id?: string
          vendor_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      fg_signal_category_stats: {
        Row: {
          click_count: number | null
          last_signal_date: string | null
          order_count: number | null
          product_category: string | null
          search_count: number | null
          total_signals: number | null
          user_id: string | null
          view_count: number | null
          wishlist_count: number | null
        }
        Relationships: []
      }
      v_crawl_progress: {
        Row: {
          errors: number | null
          null_shop_id: number | null
          pct_done: number | null
          pending: number | null
          scored: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_trend_product_matrix: {
        Args: {
          max_products_per_trend?: number
          min_similarity?: number
          period_days?: number
        }
        Returns: Json
      }
      get_trend_report_summary: {
        Args: { p_period_days?: number }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_products_hybrid: {
        Args: {
          category_filter?: string
          match_count?: number
          match_threshold?: number
          query_image_embedding?: string
          query_text_embedding: string
        }
        Returns: {
          combined_score: number
          id: string
          image_similarity: number
          text_similarity: number
        }[]
      }
      match_sourceable_products: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          factory_id: string
          id: string
          image_url: string
          item_name: string
          item_name_en: string
          similarity: number
          unit_price: number
          unit_price_usd: number
          vendor_name: string
        }[]
      }
      match_sourceable_products_hybrid: {
        Args: {
          match_threshold?: number
          max_results?: number
          query_image_embedding?: string
          query_text_embedding: string
          w_image?: number
          w_text?: number
        }
        Returns: {
          category: string
          factory_id: string
          final_score: number
          id: string
          image_sim: number
          image_url: string
          item_name: string
          item_name_en: string
          text_sim: number
          unit_price: number
          unit_price_usd: number
          used_signals: string[]
          vendor_name: string
        }[]
      }
      match_trend_analyses_by_embedding: {
        Args: { match_limit?: number; query_embedding: string }
        Returns: {
          image_url: string
          lifecycle_stage: string
          platform: string
          similarity: number
          title: string
          trend_id: string
          trend_keywords: string[]
        }[]
      }
      match_trend_analyses_by_embedding_filtered: {
        Args: {
          filter_categories?: string[]
          filter_colors?: string[]
          filter_date_from?: string
          filter_date_to?: string
          filter_genders?: string[]
          filter_lifecycle_stages?: string[]
          filter_period_days?: number
          filter_platforms?: string[]
          match_limit?: number
          query_embedding: string
        }
        Returns: {
          image_url: string
          lifecycle_stage: string
          platform: string
          similarity: number
          style_tags: string[]
          title: string
          trend_id: string
          trend_keywords: string[]
        }[]
      }
      recalculate_factory_score: {
        Args: { p_factory_id: string }
        Returns: number
      }
      update_factory_trend_scores: {
        Args: { min_similarity?: number; period_days?: number }
        Returns: {
          factory_id: string
          factory_name: string
          matched_count: number
          trend_match_score: number
          updated: boolean
        }[]
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
