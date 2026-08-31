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
      abuse_reports: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          message_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abuse_reports_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_deleted: boolean
          sender_id: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          sender_id: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          sender_id?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "admin_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_thread_reads: {
        Row: {
          last_read_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_thread_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "admin_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_thread_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_threads: {
        Row: {
          created_at: string
          created_by: string
          gm_id: string | null
          id: string
          last_message_at: string
          subject: string | null
          type: Database["public"]["Enums"]["admin_thread_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          gm_id?: string | null
          id?: string
          last_message_at?: string
          subject?: string | null
          type: Database["public"]["Enums"]["admin_thread_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          gm_id?: string | null
          id?: string
          last_message_at?: string
          subject?: string | null
          type?: Database["public"]["Enums"]["admin_thread_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_threads_gm_id_fkey"
            columns: ["gm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Relationships: []
      }
      channel_join_failures: {
        Row: {
          channel_id: string
          fail_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          channel_id: string
          fail_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          channel_id?: string
          fail_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      channel_members: {
        Row: {
          attributes: Json
          away_message: string | null
          channel_id: string
          character_avatar_url: string | null
          character_name: string
          character_notes: string | null
          character_sheet_url: string | null
          id: string
          is_active_player: boolean
          is_away: boolean
          is_blocked: boolean
          joined_at: string
          last_read_at: string
          notify_all_messages: boolean
          notify_gm_messages: boolean
          notify_turn: boolean
          user_id: string
        }
        Insert: {
          attributes?: Json
          away_message?: string | null
          channel_id: string
          character_avatar_url?: string | null
          character_name: string
          character_notes?: string | null
          character_sheet_url?: string | null
          id?: string
          is_active_player?: boolean
          is_away?: boolean
          is_blocked?: boolean
          joined_at?: string
          last_read_at?: string
          notify_all_messages?: boolean
          notify_gm_messages?: boolean
          notify_turn?: boolean
          user_id: string
        }
        Update: {
          attributes?: Json
          away_message?: string | null
          channel_id?: string
          character_avatar_url?: string | null
          character_name?: string
          character_notes?: string | null
          character_sheet_url?: string | null
          id?: string
          is_active_player?: boolean
          is_away?: boolean
          is_blocked?: boolean
          joined_at?: string
          last_read_at?: string
          notify_all_messages?: boolean
          notify_gm_messages?: boolean
          notify_turn?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_npcs: {
        Row: {
          avatar_url: string
          channel_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          avatar_url: string
          channel_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          avatar_url?: string
          channel_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_npcs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_safety_tools: {
        Row: {
          channel_id: string
          lines: string
          updated_at: string
          veils: string
        }
        Insert: {
          channel_id: string
          lines?: string
          updated_at?: string
          veils?: string
        }
        Update: {
          channel_id?: string
          lines?: string
          updated_at?: string
          veils?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_safety_tools_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_secrets: {
        Row: {
          channel_id: string
          gm_only_resources_url: string | null
          password_hash: string | null
          password_salt: string | null
        }
        Insert: {
          channel_id: string
          gm_only_resources_url?: string | null
          password_hash?: string | null
          password_salt?: string | null
        }
        Update: {
          channel_id?: string
          gm_only_resources_url?: string | null
          password_hash?: string | null
          password_salt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_secrets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          avatar_url: string | null
          created_at: string
          game_system: string
          gm_id: string | null
          id: string
          invite_code: string | null
          is_archived: boolean
          last_message_at: string | null
          map_url: string | null
          name: string
          resources_url: string | null
          safety_tools_url: string | null
          status_text: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          game_system?: string
          gm_id?: string | null
          id?: string
          invite_code?: string | null
          is_archived?: boolean
          last_message_at?: string | null
          map_url?: string | null
          name: string
          resources_url?: string | null
          safety_tools_url?: string | null
          status_text?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          game_system?: string
          gm_id?: string | null
          id?: string
          invite_code?: string | null
          is_archived?: boolean
          last_message_at?: string | null
          map_url?: string | null
          name?: string
          resources_url?: string | null
          safety_tools_url?: string | null
          status_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_gm_id_fkey"
            columns: ["gm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dice_rolls: {
        Row: {
          breakdown: Json
          channel_id: string
          created_at: string
          id: string
          message_id: string
          notation: string
          result: number
          roller_id: string
        }
        Insert: {
          breakdown: Json
          channel_id: string
          created_at?: string
          id?: string
          message_id: string
          notation: string
          result: number
          roller_id: string
        }
        Update: {
          breakdown?: Json
          channel_id?: string
          created_at?: string
          id?: string
          message_id?: string
          notation?: string
          result?: number
          roller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dice_rolls_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dice_rolls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dice_rolls_roller_id_fkey"
            columns: ["roller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      image_cleanup_audit: {
        Row: {
          completed_at: string | null
          created_at: string
          cutoff_at: string
          error_message: string | null
          id: number
          object_paths: string[]
          retention_days: number
          run_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cutoff_at: string
          error_message?: string | null
          id?: never
          object_paths: string[]
          retention_days: number
          run_id: string
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cutoff_at?: string
          error_message?: string | null
          id?: never
          object_paths?: string[]
          retention_days?: number
          run_id?: string
          status?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          channel_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel_id: string
          client_request_id: string | null
          content: string
          created_at: string
          id: string
          is_deleted: boolean
          is_edited: boolean
          mention_user_ids: string[] | null
          npc_avatar_url: string | null
          npc_name: string | null
          reply_to: string | null
          roll_dc: number | null
          roll_success: boolean | null
          search_vector: unknown
          sender_id: string | null
          type: string
          updated_at: string
          whisper_to: string | null
          reply_message: {
            channel_id: string
            client_request_id: string | null
            content: string
            created_at: string
            id: string
            is_deleted: boolean
            is_edited: boolean
            mention_user_ids: string[] | null
            npc_avatar_url: string | null
            npc_name: string | null
            reply_to: string | null
            roll_dc: number | null
            roll_success: boolean | null
            search_vector: unknown
            sender_id: string | null
            type: string
            updated_at: string
            whisper_to: string | null
          } | null
        }
        Insert: {
          channel_id: string
          client_request_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          mention_user_ids?: string[] | null
          npc_avatar_url?: string | null
          npc_name?: string | null
          reply_to?: string | null
          roll_dc?: number | null
          roll_success?: boolean | null
          search_vector?: unknown
          sender_id?: string | null
          type: string
          updated_at?: string
          whisper_to?: string | null
        }
        Update: {
          channel_id?: string
          client_request_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          mention_user_ids?: string[] | null
          npc_avatar_url?: string | null
          npc_name?: string | null
          reply_to?: string | null
          roll_dc?: number | null
          roll_success?: boolean | null
          search_vector?: unknown
          sender_id?: string | null
          type?: string
          updated_at?: string
          whisper_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whisper_to_fkey"
            columns: ["whisper_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          badge_enabled: boolean
          email_enabled: boolean
          id: string
          push_enabled: boolean
          user_id: string
        }
        Insert: {
          badge_enabled?: boolean
          email_enabled?: boolean
          id?: string
          push_enabled?: boolean
          user_id: string
        }
        Update: {
          badge_enabled?: boolean
          email_enabled?: boolean
          id?: string
          push_enabled?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          is_suspended: boolean
          server_admin: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_suspended?: boolean
          server_admin?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_suspended?: boolean
          server_admin?: boolean
        }
        Relationships: []
      }
      push_delivery_log: {
        Row: {
          created_at: string
          error_category: string | null
          event_id: string
          event_kind: string
          id: string
          status: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_category?: string | null
          event_id: string
          event_kind: string
          id?: string
          status: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_category?: string | null
          event_id?: string
          event_kind?: string
          id?: string
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      push_invocation_log: {
        Row: {
          created_at: string
          entity_id: string
          event_kind: string
          id: number
          request_id: number
        }
        Insert: {
          created_at?: string
          entity_id: string
          event_kind: string
          id?: number
          request_id: number
        }
        Update: {
          created_at?: string
          entity_id?: string
          event_kind?: string
          id?: number
          request_id?: number
        }
        Relationships: []
      }
      push_notification_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_card_events: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          message_id: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          message_id?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_card_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_card_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_claim_channel: {
        Args: { p_channel_id: string }
        Returns: undefined
      }
      admin_get_image_storage_bytes: { Args: never; Returns: number }
      admin_list_active_gms: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          id: string
        }[]
      }
      admin_list_channels: {
        Args: never
        Returns: {
          created_at: string
          game_system: string
          gm_display_name: string
          gm_id: string
          id: string
          last_message_at: string
          member_count: number
          name: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          channel_count: number
          created_at: string
          display_name: string
          email: string
          id: string
          is_suspended: boolean
        }[]
      }
      admin_suspend_user: {
        Args: { p_reason?: string; p_suspend: boolean; p_user_id: string }
        Returns: undefined
      }
      build_dice_content: {
        Args: {
          p_modifier: number
          p_notation: string
          p_rolls: number[]
          p_total: number
        }
        Returns: string
      }
      create_channel: {
        Args: {
          p_character_avatar_url?: string
          p_character_name: string
          p_character_sheet_url?: string
          p_game_system?: string
          p_invite_code: string
          p_name: string
          p_password_hash?: string
          p_password_salt?: string
        }
        Returns: string
      }
      get_admin_unread_count: { Args: { p_user_id: string }; Returns: number }
      get_channel_roll_history: {
        Args: { p_channel_id: string }
        Returns: {
          breakdown: Json
          created_at: string
          id: string
          notation: string
          result: number
          roller_display_name: string
          roller_id: string
        }[]
      }
      get_channel_salt: { Args: { p_channel_id: string }; Returns: string }
      get_join_channel_preview: {
        Args: { p_channel_id: string }
        Returns: {
          game_system: string
          has_password: boolean
          id: string
          name: string
        }[]
      }
      get_unread_totals: {
        Args: { p_user_ids: string[] }
        Returns: {
          unread_count: number
          user_id: string
        }[]
      }
      get_user_channels_unread: {
        Args: { p_user_id: string }
        Returns: {
          channel_id: string
          unread_count: number
        }[]
      }
      has_password: {
        Args: { c: Database["public"]["Tables"]["channels"]["Row"] }
        Returns: boolean
      }
      is_active_gm: { Args: { p_user_id: string }; Returns: boolean }
      is_channel_gm: { Args: { c_id: string }; Returns: boolean }
      is_channel_member: { Args: { c_id: string }; Returns: boolean }
      is_server_admin: { Args: never; Returns: boolean }
      is_suspended: { Args: { u_id: string }; Returns: boolean }
      join_channel: {
        Args: {
          p_channel_id: string
          p_character_attributes?: Json
          p_character_avatar_url?: string
          p_character_name: string
          p_character_sheet_url?: string
          p_invite_code?: string
          p_password_hash?: string
        }
        Returns: Json
      }
      mark_admin_thread_read: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      moderate_member: {
        Args: { p_action: string; p_channel_id: string; p_member_id: string }
        Returns: undefined
      }
      push_notification_config_value: {
        Args: { p_key: string }
        Returns: string
      }
      reply_message: {
        Args: { "": Database["public"]["Tables"]["messages"]["Row"] }
        Returns: {
          channel_id: string
          client_request_id: string | null
          content: string
          created_at: string
          id: string
          is_deleted: boolean
          is_edited: boolean
          mention_user_ids: string[] | null
          npc_avatar_url: string | null
          npc_name: string | null
          reply_to: string | null
          roll_dc: number | null
          roll_success: boolean | null
          search_vector: unknown
          sender_id: string | null
          type: string
          updated_at: string
          whisper_to: string | null
        }
        SetofOptions: {
          from: "messages"
          to: "messages"
          isOneToOne: true
          isSetofReturn: true
        }
      }
      resolve_mention_user_ids: {
        Args: { p_channel_id: string; p_content: string }
        Returns: string[]
      }
      retry_failed_push_invocations: {
        Args: { p_max?: number }
        Returns: number
      }
      roll_dice: {
        Args: {
          p_channel_id: string
          p_client_request_id?: string
          p_dc?: number
          p_notation: string
          p_reply_to?: string
          p_warning?: string
        }
        Returns: {
          dice_roll_id: string
          message_id: string
        }[]
      }
      roll_dice_unchecked: {
        Args: {
          p_channel_id: string
          p_client_request_id?: string
          p_dc?: number
          p_notation: string
          p_reply_to?: string
          p_warning?: string
        }
        Returns: {
          dice_roll_id: string
          message_id: string
        }[]
      }
      send_message: {
        Args: {
          p_active_player_ids?: string[]
          p_channel_id: string
          p_client_request_id?: string
          p_content: string
          p_npc_avatar_url?: string
          p_npc_name?: string
          p_reply_to?: string
          p_type?: string
          p_whisper_to?: string
        }
        Returns: {
          message_id: string
        }[]
      }
      set_active_players: {
        Args: { p_active_player_ids: string[]; p_channel_id: string }
        Returns: undefined
      }
      update_channel_settings: {
        Args: {
          p_channel_id: string
          p_clear_password?: boolean
          p_game_system?: string
          p_gm_only_resources_url?: string
          p_map_url?: string
          p_name?: string
          p_password_hash?: string
          p_password_salt?: string
          p_resources_url?: string
          p_safety_lines?: string
          p_safety_tools_url?: string
          p_safety_veils?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      admin_thread_type: "announcement" | "dm"
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
    Enums: {
      admin_thread_type: ["announcement", "dm"],
    },
  },
} as const

