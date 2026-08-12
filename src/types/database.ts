export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
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
      profiles: {
        Row: {
          id: string
          display_name: string | null
          email: string | null
          avatar_url: string | null
          server_admin: boolean
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          email?: string | null
          avatar_url?: string | null
          server_admin?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          email?: string | null
          avatar_url?: string | null
          server_admin?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      channels: {
        Row: {
          id: string
          name: string
          gm_id: string
          is_archived: boolean
          game_system: string
            invite_code: string | null
            map_url: string | null
            resources_url: string | null
            safety_tools_url: string | null
            status_text: string | null
          last_message_at: string | null
          created_at: string
          updated_at: string
          has_password?: boolean
        }
        Insert: {
          id?: string
          name: string
          gm_id: string
          is_archived?: boolean
          game_system?: string
            invite_code?: string | null
            map_url?: string | null
            resources_url?: string | null
            safety_tools_url?: string | null
            status_text?: string | null
          last_message_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          gm_id?: string
          is_archived?: boolean
          game_system?: string
            invite_code?: string | null
            map_url?: string | null
            resources_url?: string | null
            safety_tools_url?: string | null
            status_text?: string | null
          last_message_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_gm_id_fkey"
            columns: ["gm_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      channel_secrets: {
        Row: {
          channel_id: string
          password_hash: string | null
          password_salt: string | null
          gm_only_resources_url: string | null
        }
        Insert: {
          channel_id: string
          password_hash?: string | null
          password_salt?: string | null
          gm_only_resources_url?: string | null
        }
        Update: {
          channel_id?: string
          password_hash?: string | null
          password_salt?: string | null
          gm_only_resources_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_secrets_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          }
        ]
      }
      channel_members: {
        Row: {
          id: string
          channel_id: string
          user_id: string
          character_name: string
          character_avatar_url: string | null
          character_sheet_url: string | null
          is_active_player: boolean
          is_blocked: boolean
          is_away: boolean
          away_message: string | null
          attributes: any
          notify_all_messages: boolean
          notify_gm_messages: boolean
          notify_turn: boolean
          last_read_at?: string
          joined_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          user_id: string
          character_name: string
          character_avatar_url?: string | null
          character_sheet_url?: string | null
          is_active_player?: boolean
          is_blocked?: boolean
          is_away?: boolean
          away_message?: string | null
          attributes?: any
          notify_all_messages?: boolean
          notify_gm_messages?: boolean
          notify_turn?: boolean
          last_read_at?: string
          joined_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          user_id?: string
          character_name?: string
          character_avatar_url?: string | null
          character_sheet_url?: string | null
          is_active_player?: boolean
          is_blocked?: boolean
          is_away?: boolean
          away_message?: string | null
          attributes?: any
          notify_all_messages?: boolean
          notify_gm_messages?: boolean
          notify_turn?: boolean
          last_read_at?: string
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      channel_npcs: {
        Row: {
          id: string
          channel_id: string
          name: string
          avatar_url: string
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          name: string
          avatar_url: string
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          name?: string
          avatar_url?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_npcs_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          }
        ]
      }
      channel_safety_tools: {
        Row: {
          channel_id: string
          lines: string
          veils: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          lines?: string
          veils?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          lines?: string
          veils?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_safety_tools_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          channel_id: string
          sender_id: string | null
          type: 'regular' | 'scene' | 'dice_roll' | 'system' | 'npc'
          content: string
          whisper_to: string | null
          reply_to: string | null
          npc_name: string | null
          npc_avatar_url: string | null
          is_edited: boolean
          is_deleted: boolean
          search_vector: unknown | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          sender_id?: string | null
          type: 'regular' | 'scene' | 'dice_roll' | 'system' | 'npc'
          content: string
          whisper_to?: string | null
          reply_to?: string | null
          npc_name?: string | null
          npc_avatar_url?: string | null
          is_edited?: boolean
          is_deleted?: boolean
          search_vector?: unknown | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          sender_id?: string | null
          type?: 'regular' | 'scene' | 'dice_roll' | 'system' | 'npc'
          content?: string
          whisper_to?: string | null
          reply_to?: string | null
          npc_name?: string | null
          npc_avatar_url?: string | null
          is_edited?: boolean
          is_deleted?: boolean
          search_vector?: unknown | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whisper_to_fkey"
            columns: ["whisper_to"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            referencedRelation: "messages"
            referencedColumns: ["id"]
          }
        ]
      }
      message_reactions: {
        Row: {
          id: string
          message_id: string
          channel_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          channel_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          channel_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      dice_rolls: {
        Row: {
          id: string
          message_id: string
          channel_id: string
          roller_id: string
          notation: string
          result: number
          breakdown: Json
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          channel_id: string
          roller_id: string
          notation: string
          result: number
          breakdown: Json
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          channel_id?: string
          roller_id?: string
          notation?: string
          result?: number
          breakdown?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dice_rolls_message_id_fkey"
            columns: ["message_id"]
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dice_rolls_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dice_rolls_roller_id_fkey"
            columns: ["roller_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      notification_preferences: {
        Row: {
          id: string
          user_id: string
          push_enabled: boolean
          badge_enabled: boolean
          email_enabled: boolean
        }
        Insert: {
          id?: string
          user_id: string
          push_enabled?: boolean
          badge_enabled?: boolean
          email_enabled?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          push_enabled?: boolean
          badge_enabled?: boolean
          email_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      safety_card_events: {
        Row: {
          id: string
          channel_id: string
          message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          message_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_card_events_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_card_events_message_id_fkey"
            columns: ["message_id"]
            referencedRelation: "messages"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_channel_salt: {
        Args: {
          p_channel_id: string
        }
        Returns: string
      }
      get_join_channel_preview: {
        Args: {
          p_channel_id: string
        }
        Returns: {
          id: string
          name: string
          game_system: string
          has_password: boolean
        }[]
      }
      join_channel: {
        Args: {
          p_channel_id: string
          p_character_name: string
          p_character_avatar_url?: string
          p_character_sheet_url?: string
          p_password_hash?: string
          p_invite_code?: string
        }
        Returns: undefined
      }
      create_channel: {
        Args: {
          p_name: string
          p_game_system?: string
          p_invite_code: string
          p_character_name: string
          p_character_avatar_url?: string
          p_character_sheet_url?: string
          p_password_hash?: string | null
          p_password_salt?: string | null
        }
        Returns: string
      }
      admin_list_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          display_name: string | null
          email: string | null
          channel_count: number
          created_at: string
        }[]
      }
      admin_list_channels: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          game_system: string
          member_count: number
          created_at: string
          last_message_at: string | null
          gm_display_name: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
