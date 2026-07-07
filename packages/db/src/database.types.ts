export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          owner_user_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          owner_user_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          owner_user_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      appeals: {
        Row: {
          appellant_user_id: string
          body: string
          created_at: string
          decided_at: string | null
          decision_notes: string | null
          id: string
          mod_action_id: string
          reviewed_by_user_id: string | null
          status: Database["public"]["Enums"]["appeal_status"]
          updated_at: string
        }
        Insert: {
          appellant_user_id: string
          body: string
          created_at?: string
          decided_at?: string | null
          decision_notes?: string | null
          id?: string
          mod_action_id: string
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["appeal_status"]
          updated_at?: string
        }
        Update: {
          appellant_user_id?: string
          body?: string
          created_at?: string
          decided_at?: string | null
          decision_notes?: string | null
          id?: string
          mod_action_id?: string
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["appeal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appeals_appellant_user_id_fkey"
            columns: ["appellant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appeals_mod_action_id_fkey"
            columns: ["mod_action_id"]
            isOneToOne: true
            referencedRelation: "mod_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appeals_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          api_key_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: Database["public"]["Enums"]["entity_type"] | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          api_key_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["entity_type"] | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          api_key_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["entity_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_email_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          token_hash: string
          type: string
          user_id: string | null
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          token_hash: string
          type: string
          user_id?: string | null
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          token_hash?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_email_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      award_votes: {
        Row: {
          category: Database["public"]["Enums"]["award_category"]
          created_at: string
          id: string
          quarter: string
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
          voter_user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["award_category"]
          created_at?: string
          id?: string
          quarter: string
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
          voter_user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["award_category"]
          created_at?: string
          id?: string
          quarter?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["entity_type"]
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_votes_voter_user_id_fkey"
            columns: ["voter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      block_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_listings: {
        Row: {
          address: string | null
          business_name: string
          category_id: string
          city: string | null
          contact_links: Json
          country: string | null
          created_at: string
          export_checklist: Json | null
          export_readiness_score: number | null
          id: string
          landmark: string | null
          latitude: number | null
          longitude: number | null
          opening_hours: Json | null
          owner_user_id: string | null
          photo_count: number
          price_range: number | null
          primary_photo_alt: string | null
          primary_photo_blurhash: string | null
          primary_photo_path: string | null
          search_norm: string | null
          short_description: string | null
          source: Database["public"]["Enums"]["content_source"]
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["listing_verification_status"]
        }
        Insert: {
          address?: string | null
          business_name: string
          category_id: string
          city?: string | null
          contact_links?: Json
          country?: string | null
          created_at?: string
          export_checklist?: Json | null
          export_readiness_score?: number | null
          id?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          opening_hours?: Json | null
          owner_user_id?: string | null
          photo_count?: number
          price_range?: number | null
          primary_photo_alt?: string | null
          primary_photo_blurhash?: string | null
          primary_photo_path?: string | null
          search_norm?: string | null
          short_description?: string | null
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["listing_verification_status"]
        }
        Update: {
          address?: string | null
          business_name?: string
          category_id?: string
          city?: string | null
          contact_links?: Json
          country?: string | null
          created_at?: string
          export_checklist?: Json | null
          export_readiness_score?: number | null
          id?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          opening_hours?: Json | null
          owner_user_id?: string | null
          photo_count?: number
          price_range?: number | null
          primary_photo_alt?: string | null
          primary_photo_blurhash?: string | null
          primary_photo_path?: string | null
          search_norm?: string | null
          short_description?: string | null
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["listing_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "business_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "listing_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_listings_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_reviews: {
        Row: {
          candidate_id: string
          created_at: string
          feasibility_score: number | null
          id: string
          notes: string | null
          reviewer_user_id: string
          team_score: number | null
          traction_score: number | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          feasibility_score?: number | null
          id?: string
          notes?: string | null
          reviewer_user_id: string
          team_score?: number | null
          traction_score?: number | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          feasibility_score?: number | null
          id?: string
          notes?: string | null
          reviewer_user_id?: string
          team_score?: number | null
          traction_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_reviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "venture_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_votes: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voter_user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voter_user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          vote?: Database["public"]["Enums"]["vote_choice"]
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "venture_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_votes_voter_user_id_fkey"
            columns: ["voter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_gate_evaluations: {
        Row: {
          attested: boolean
          candidate_id: string | null
          created_at: string
          geo_ip_country: string | null
          granted: boolean
          id: string
          profile_country: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          attested?: boolean
          candidate_id?: string | null
          created_at?: string
          geo_ip_country?: string | null
          granted: boolean
          id?: string
          profile_country?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          attested?: boolean
          candidate_id?: string | null
          created_at?: string
          geo_ip_country?: string | null
          granted?: boolean
          id?: string
          profile_country?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_gate_evaluations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "venture_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_gate_evaluations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_user_id: string
          body: string
          candidate_id: string | null
          created_at: string
          edited_at: string | null
          id: string
          is_credited_answer: boolean
          post_id: string | null
          source: Database["public"]["Enums"]["content_source"]
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          candidate_id?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          is_credited_answer?: boolean
          post_id?: string | null
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          candidate_id?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          is_credited_answer?: boolean
          post_id?: string | null
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_candidate_fk"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "venture_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string
          document_url: string | null
          granted_at: string
          id: string
          method: string | null
          user_id: string
          version: string
          withdrawn_at: string | null
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          document_url?: string | null
          granted_at?: string
          id?: string
          method?: string | null
          user_id: string
          version: string
          withdrawn_at?: string | null
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          document_url?: string | null
          granted_at?: string
          id?: string
          method?: string | null
          user_id?: string
          version?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          initiator_last_read_at: string | null
          initiator_user_id: string
          recipient_last_read_at: string | null
          recipient_user_id: string
          status: Database["public"]["Enums"]["conversation_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          initiator_last_read_at?: string | null
          initiator_user_id: string
          recipient_last_read_at?: string | null
          recipient_user_id: string
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          initiator_last_read_at?: string | null
          initiator_user_id?: string
          recipient_last_read_at?: string | null
          recipient_user_id?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_initiator_user_id_fkey"
            columns: ["initiator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          event_count: number
          last_event_at: string
          reason: string
          released_at: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_count?: number
          last_event_at?: string
          reason: string
          released_at?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_count?: number
          last_event_at?: string
          reason?: string
          released_at?: string | null
          source?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_user_id: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["follow_target_type"]
        }
        Insert: {
          created_at?: string
          follower_user_id: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["follow_target_type"]
        }
        Update: {
          created_at?: string
          follower_user_id?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["follow_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_user_id_fkey"
            columns: ["follower_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_log_entries: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_log_entries_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interests: {
        Row: {
          candidate_id: string | null
          created_at: string
          id: string
          message: string | null
          type: Database["public"]["Enums"]["interest_type"]
          user_id: string
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          type: Database["public"]["Enums"]["interest_type"]
          user_id: string
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          type?: Database["public"]["Enums"]["interest_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interests_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "venture_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by_user_id: string | null
          expires_at: string | null
          id: string
          note: string | null
          redeemed_at: string | null
          redeemed_by_user_id: string | null
          revoked_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          revoked_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_redeemed_by_user_id_fkey"
            columns: ["redeemed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_artifacts: {
        Row: {
          added_by_user_id: string
          created_at: string
          description: string | null
          id: string
          lab_id: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          url: string
        }
        Insert: {
          added_by_user_id: string
          created_at?: string
          description?: string | null
          id?: string
          lab_id: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          url: string
        }
        Update: {
          added_by_user_id?: string
          created_at?: string
          description?: string | null
          id?: string
          lab_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_artifacts_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_artifacts_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_collaborations: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          lab_a_id: string
          lab_b_id: string
          proposed_by_user_id: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["lab_collaboration_status"]
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          lab_a_id: string
          lab_b_id: string
          proposed_by_user_id?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["lab_collaboration_status"]
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          lab_a_id?: string
          lab_b_id?: string
          proposed_by_user_id?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["lab_collaboration_status"]
        }
        Relationships: [
          {
            foreignKeyName: "lab_collaborations_lab_a_id_fkey"
            columns: ["lab_a_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_collaborations_lab_b_id_fkey"
            columns: ["lab_b_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_collaborations_proposed_by_user_id_fkey"
            columns: ["proposed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_decisions: {
        Row: {
          context: string | null
          created_at: string
          created_by_user_id: string
          decided_at: string
          decision: string
          id: string
          lab_id: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          created_by_user_id: string
          decided_at?: string
          decision: string
          id?: string
          lab_id: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
        }
        Update: {
          context?: string | null
          created_at?: string
          created_by_user_id?: string
          decided_at?: string
          decision?: string
          id?: string
          lab_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_decisions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_decisions_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          lab_id: string
          metadata: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          lab_id: string
          metadata?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          lab_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lab_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_events_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_members: {
        Row: {
          created_at: string
          invited_by_user_id: string | null
          joined_at: string | null
          lab_id: string
          requested_at: string | null
          role: Database["public"]["Enums"]["lab_member_role"]
          specialization:
            | Database["public"]["Enums"]["lab_member_specialization"]
            | null
          status: Database["public"]["Enums"]["lab_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by_user_id?: string | null
          joined_at?: string | null
          lab_id: string
          requested_at?: string | null
          role?: Database["public"]["Enums"]["lab_member_role"]
          specialization?:
            | Database["public"]["Enums"]["lab_member_specialization"]
            | null
          status?: Database["public"]["Enums"]["lab_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by_user_id?: string | null
          joined_at?: string | null
          lab_id?: string
          requested_at?: string | null
          role?: Database["public"]["Enums"]["lab_member_role"]
          specialization?:
            | Database["public"]["Enums"]["lab_member_specialization"]
            | null
          status?: Database["public"]["Enums"]["lab_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_members_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_members_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_playbooks: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          source: Database["public"]["Enums"]["content_source"]
          template: Json
          updated_at: string
          venture_type: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          source?: Database["public"]["Enums"]["content_source"]
          template?: Json
          updated_at?: string
          venture_type: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          source?: Database["public"]["Enums"]["content_source"]
          template?: Json
          updated_at?: string
          venture_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_playbooks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_skill_needs: {
        Row: {
          alerted_at: string | null
          created_at: string
          filled_at: string | null
          filled_by_user_id: string | null
          id: string
          lab_id: string
          skill: string
        }
        Insert: {
          alerted_at?: string | null
          created_at?: string
          filled_at?: string | null
          filled_by_user_id?: string | null
          id?: string
          lab_id: string
          skill: string
        }
        Update: {
          alerted_at?: string | null
          created_at?: string
          filled_at?: string | null
          filled_by_user_id?: string | null
          id?: string
          lab_id?: string
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_skill_needs_filled_by_user_id_fkey"
            columns: ["filled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_skill_needs_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_tags: {
        Row: {
          created_at: string
          lab_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          lab_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          lab_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_tags_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_updates: {
        Row: {
          author_user_id: string
          body: string
          collaboration_id: string | null
          created_at: string
          id: string
          lab_id: string
          source: Database["public"]["Enums"]["content_source"]
          status: Database["public"]["Enums"]["content_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          collaboration_id?: string | null
          created_at?: string
          id?: string
          lab_id: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          collaboration_id?: string | null
          created_at?: string
          id?: string
          lab_id?: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_updates_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_updates_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "lab_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_updates_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      labs: {
        Row: {
          charter_completed_at: string | null
          cover_blurhash: string | null
          cover_path: string | null
          created_at: string
          dormant_since: string | null
          hypothesis: string | null
          icon_blurhash: string | null
          icon_path: string | null
          id: string
          is_listed: boolean
          is_supporter_only: boolean
          join_mode: Database["public"]["Enums"]["lab_join_mode"]
          last_activity_at: string
          lead_user_id: string
          member_list_visibility: Database["public"]["Enums"]["lab_visibility"]
          name: string
          playbook_id: string | null
          problem_statement: string | null
          promoted_at: string | null
          settings: Json
          short_description: string | null
          slug: string
          source: Database["public"]["Enums"]["content_source"]
          space_mode: Database["public"]["Enums"]["space_mode"]
          sprint_deadline: string | null
          sprint_length_weeks: number | null
          stage: Database["public"]["Enums"]["lab_stage"]
          success_definition: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["lab_visibility"]
        }
        Insert: {
          charter_completed_at?: string | null
          cover_blurhash?: string | null
          cover_path?: string | null
          created_at?: string
          dormant_since?: string | null
          hypothesis?: string | null
          icon_blurhash?: string | null
          icon_path?: string | null
          id?: string
          is_listed?: boolean
          is_supporter_only?: boolean
          join_mode?: Database["public"]["Enums"]["lab_join_mode"]
          last_activity_at?: string
          lead_user_id: string
          member_list_visibility?: Database["public"]["Enums"]["lab_visibility"]
          name: string
          playbook_id?: string | null
          problem_statement?: string | null
          promoted_at?: string | null
          settings?: Json
          short_description?: string | null
          slug: string
          source?: Database["public"]["Enums"]["content_source"]
          space_mode?: Database["public"]["Enums"]["space_mode"]
          sprint_deadline?: string | null
          sprint_length_weeks?: number | null
          stage?: Database["public"]["Enums"]["lab_stage"]
          success_definition?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["lab_visibility"]
        }
        Update: {
          charter_completed_at?: string | null
          cover_blurhash?: string | null
          cover_path?: string | null
          created_at?: string
          dormant_since?: string | null
          hypothesis?: string | null
          icon_blurhash?: string | null
          icon_path?: string | null
          id?: string
          is_listed?: boolean
          is_supporter_only?: boolean
          join_mode?: Database["public"]["Enums"]["lab_join_mode"]
          last_activity_at?: string
          lead_user_id?: string
          member_list_visibility?: Database["public"]["Enums"]["lab_visibility"]
          name?: string
          playbook_id?: string | null
          problem_statement?: string | null
          promoted_at?: string | null
          settings?: Json
          short_description?: string | null
          slug?: string
          source?: Database["public"]["Enums"]["content_source"]
          space_mode?: Database["public"]["Enums"]["space_mode"]
          sprint_deadline?: string | null
          sprint_length_weeks?: number | null
          stage?: Database["public"]["Enums"]["lab_stage"]
          success_definition?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["lab_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "labs_lead_user_id_fkey"
            columns: ["lead_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labs_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "lab_playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_so: string | null
          position: number
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_so?: string | null
          position?: number
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_so?: string | null
          position?: number
          slug?: string
        }
        Relationships: []
      }
      listing_claims: {
        Row: {
          claimant_user_id: string
          created_at: string
          decided_at: string | null
          evidence: string | null
          id: string
          listing_id: string
          reviewed_by_user_id: string | null
          status: Database["public"]["Enums"]["claim_status"]
          updated_at: string
        }
        Insert: {
          claimant_user_id: string
          created_at?: string
          decided_at?: string | null
          evidence?: string | null
          id?: string
          listing_id: string
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Update: {
          claimant_user_id?: string
          created_at?: string
          decided_at?: string | null
          evidence?: string | null
          id?: string
          listing_id?: string
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_claims_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_claims_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "business_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_claims_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "following_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_claims_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          alt_text: string
          blurhash: string | null
          created_at: string
          height: number | null
          id: string
          listing_id: string
          media_upload_id: string | null
          sort_order: number
          storage_path: string
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          alt_text: string
          blurhash?: string | null
          created_at?: string
          height?: number | null
          id?: string
          listing_id: string
          media_upload_id?: string | null
          sort_order?: number
          storage_path: string
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string
          blurhash?: string | null
          created_at?: string
          height?: number | null
          id?: string
          listing_id?: string
          media_upload_id?: string | null
          sort_order?: number
          storage_path?: string
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "business_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "following_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_photos_media_upload_id_fkey"
            columns: ["media_upload_id"]
            isOneToOne: false
            referencedRelation: "media_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_services: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          name: string
          price_label: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          name: string
          price_label?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          name?: string
          price_label?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_services_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "business_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_services_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "following_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_tags: {
        Row: {
          created_at: string
          listing_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_tags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "business_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_tags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "following_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      media_kinds: {
        Row: {
          created_at: string
          description: string | null
          id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      media_uploads: {
        Row: {
          alt_text: string | null
          blurhash: string | null
          bucket: string
          bytes: number
          created_at: string
          height: number | null
          id: string
          kind: string
          mime_type: string
          owner_user_id: string
          post_id: string | null
          scan_status: Database["public"]["Enums"]["media_scan_status"]
          scan_verdict: Json
          storage_path: string
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blurhash?: string | null
          bucket?: string
          bytes: number
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string
          owner_user_id: string
          post_id?: string | null
          scan_status: Database["public"]["Enums"]["media_scan_status"]
          scan_verdict?: Json
          storage_path: string
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blurhash?: string | null
          bucket?: string
          bytes?: number
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string
          owner_user_id?: string
          post_id?: string | null
          scan_status?: Database["public"]["Enums"]["media_scan_status"]
          scan_verdict?: Json
          storage_path?: string
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_uploads_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "media_kinds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_uploads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_uploads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tiers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          monthly_price_usd: number
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          monthly_price_usd?: number
          name: string
          position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_price_usd?: number
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_user_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_actions: {
        Row: {
          action: Database["public"]["Enums"]["mod_action_type"]
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          report_id: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
        }
        Insert: {
          action: Database["public"]["Enums"]["mod_action_type"]
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          report_id?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
        }
        Update: {
          action?: Database["public"]["Enums"]["mod_action_type"]
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          report_id?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["entity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "mod_actions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mod_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reviews: {
        Row: {
          ai_verdict: Json
          author_user_id: string
          content_excerpt: string | null
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          language: string | null
          reason: Database["public"]["Enums"]["moderation_review_reason"]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: Database["public"]["Enums"]["moderation_review_status"]
        }
        Insert: {
          ai_verdict?: Json
          author_user_id: string
          content_excerpt?: string | null
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          language?: string | null
          reason: Database["public"]["Enums"]["moderation_review_reason"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["moderation_review_status"]
        }
        Update: {
          ai_verdict?: Json
          author_user_id?: string
          content_excerpt?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          language?: string | null
          reason?: Database["public"]["Enums"]["moderation_review_reason"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["moderation_review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reviews_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reviews_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mutes: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          channel: string
          enabled: boolean
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          enabled: boolean
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          bundle_key: string | null
          created_at: string
          emailed_at: string | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          id: string
          payload: Json
          pushed_at: string | null
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          bundle_key?: string | null
          created_at?: string
          emailed_at?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          payload?: Json
          pushed_at?: string | null
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          bundle_key?: string | null
          created_at?: string
          emailed_at?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          payload?: Json
          pushed_at?: string | null
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      open_to_kinds: {
        Row: {
          created_at: string
          id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id: string
          sort_order: number
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
        }
        Relationships: []
      }
      page_blocks: {
        Row: {
          block_type: string
          config: Json
          created_at: string
          id: string
          owner_id: string
          owner_type: string
          position: number
          span: string
          updated_at: string
          visibility: string
        }
        Insert: {
          block_type: string
          config?: Json
          created_at?: string
          id?: string
          owner_id: string
          owner_type: string
          position: number
          span?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          block_type?: string
          config?: Json
          created_at?: string
          id?: string
          owner_id?: string
          owner_type?: string
          position?: number
          span?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_blocks_block_type_fkey"
            columns: ["block_type"]
            isOneToOne: false
            referencedRelation: "block_types"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          post_id: string
          post_type: Database["public"]["Enums"]["post_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          post_id: string
          post_type?: Database["public"]["Enums"]["post_type"]
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          post_id?: string
          post_type?: Database["public"]["Enums"]["post_type"]
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_post_is_poll"
            columns: ["post_id", "post_type"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "type"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          poll_option_id: string
          post_id: string
          updated_at: string
          voter_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          poll_option_id: string
          post_id: string
          updated_at?: string
          voter_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          poll_option_id?: string
          post_id?: string
          updated_at?: string
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_belongs_to_poll"
            columns: ["poll_option_id", "post_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id", "post_id"]
          },
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_user_id_fkey"
            columns: ["voter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_drafts: {
        Row: {
          created_at: string
          id: string
          lab_id: string | null
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lab_id?: string | null
          payload: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lab_id?: string | null
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_drafts_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_revisions: {
        Row: {
          created_at: string
          editor_user_id: string
          had_replies: boolean
          id: string
          post_id: string
          previous_body: string | null
          previous_link_url: string | null
          previous_title: string | null
        }
        Insert: {
          created_at?: string
          editor_user_id: string
          had_replies?: boolean
          id?: string
          post_id: string
          previous_body?: string | null
          previous_link_url?: string | null
          previous_title?: string | null
        }
        Update: {
          created_at?: string
          editor_user_id?: string
          had_replies?: boolean
          id?: string
          post_id?: string
          previous_body?: string | null
          previous_link_url?: string | null
          previous_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_revisions_editor_user_id_fkey"
            columns: ["editor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          post_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ask_nudged_at: string | null
          ask_status: Database["public"]["Enums"]["ask_status"] | null
          author_user_id: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          image_urls: string[]
          lab_id: string | null
          link_url: string | null
          pinned_at: string | null
          poll_closes_at: string | null
          poll_status: Database["public"]["Enums"]["poll_status"] | null
          source: Database["public"]["Enums"]["content_source"]
          status: Database["public"]["Enums"]["content_status"]
          title: string | null
          type: Database["public"]["Enums"]["post_type"]
          updated_at: string
        }
        Insert: {
          ask_nudged_at?: string | null
          ask_status?: Database["public"]["Enums"]["ask_status"] | null
          author_user_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          image_urls?: string[]
          lab_id?: string | null
          link_url?: string | null
          pinned_at?: string | null
          poll_closes_at?: string | null
          poll_status?: Database["public"]["Enums"]["poll_status"] | null
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          type: Database["public"]["Enums"]["post_type"]
          updated_at?: string
        }
        Update: {
          ask_nudged_at?: string | null
          ask_status?: Database["public"]["Enums"]["ask_status"] | null
          author_user_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          image_urls?: string[]
          lab_id?: string | null
          link_url?: string | null
          pinned_at?: string | null
          poll_closes_at?: string | null
          poll_status?: Database["public"]["Enums"]["poll_status"] | null
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_lab_fk"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_open_to: {
        Row: {
          created_at: string
          open_to_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          open_to_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          open_to_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_open_to_open_to_id_fkey"
            columns: ["open_to_id"]
            isOneToOne: false
            referencedRelation: "open_to_kinds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_open_to_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_pinned_labs: {
        Row: {
          created_at: string
          lab_id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          lab_id: string
          position: number
          user_id: string
        }
        Update: {
          created_at?: string
          lab_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_pinned_labs_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_pinned_labs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_pins: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          position: number
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_blurhash: string | null
          avatar_path: string | null
          bio: string | null
          contact_options: Json
          cover_blurhash: string | null
          cover_path: string | null
          created_at: string
          display_name: string
          handle: string
          lanes: string[]
          latitude: number | null
          links: Json
          location_city: string | null
          location_country: string | null
          longitude: number | null
          membership_tier_id: string
          region_attested_at: string | null
          region_verified: boolean
          search_norm: string | null
          skills: string[]
          subscription_status: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["profile_verification_status"]
        }
        Insert: {
          avatar_blurhash?: string | null
          avatar_path?: string | null
          bio?: string | null
          contact_options?: Json
          cover_blurhash?: string | null
          cover_path?: string | null
          created_at?: string
          display_name: string
          handle: string
          lanes?: string[]
          latitude?: number | null
          links?: Json
          location_city?: string | null
          location_country?: string | null
          longitude?: number | null
          membership_tier_id?: string
          region_attested_at?: string | null
          region_verified?: boolean
          search_norm?: string | null
          skills?: string[]
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["profile_verification_status"]
        }
        Update: {
          avatar_blurhash?: string | null
          avatar_path?: string | null
          bio?: string | null
          contact_options?: Json
          cover_blurhash?: string | null
          cover_path?: string | null
          created_at?: string
          display_name?: string
          handle?: string
          lanes?: string[]
          latitude?: number | null
          links?: Json
          location_city?: string | null
          location_country?: string | null
          longitude?: number | null
          membership_tier_id?: string
          region_attested_at?: string | null
          region_verified?: boolean
          search_norm?: string | null
          skills?: string[]
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["profile_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_membership_tier_id_fkey"
            columns: ["membership_tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          type?: Database["public"]["Enums"]["reaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_user_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_user_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_user_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          event_type: string
          id: string
          points: number
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          event_type: string
          id?: string
          points: number
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          event_type?: string
          id?: string
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reputation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_scores: {
        Row: {
          contribution_score: number
          current_streak_days: number
          helper_score: number
          last_active_on: string | null
          longest_streak_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          contribution_score?: number
          current_streak_days?: number
          helper_score?: number
          last_active_on?: string | null
          longest_streak_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          contribution_score?: number
          current_streak_days?: number
          helper_score?: number
          last_active_on?: string | null
          longest_streak_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reputation_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_grants: {
        Row: {
          consumed_at: string | null
          consumed_by_user_id: string | null
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invite_id: string | null
          phone: string | null
          waitlist_entry_id: string | null
        }
        Insert: {
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          invite_id?: string | null
          phone?: string | null
          waitlist_entry_id?: string | null
        }
        Update: {
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invite_id?: string | null
          phone?: string | null
          waitlist_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signup_grants_consumed_by_user_id_fkey"
            columns: ["consumed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_grants_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_grants_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_endorsements: {
        Row: {
          created_at: string
          endorsee_user_id: string
          endorser_user_id: string
          id: string
          skill: string
        }
        Insert: {
          created_at?: string
          endorsee_user_id: string
          endorser_user_id: string
          id?: string
          skill: string
        }
        Update: {
          created_at?: string
          endorsee_user_id?: string
          endorser_user_id?: string
          id?: string
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_endorsements_endorsee_user_id_fkey"
            columns: ["endorsee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_endorsements_endorser_user_id_fkey"
            columns: ["endorser_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          description: string | null
          id: string
          name: string
          source: Database["public"]["Enums"]["content_source"]
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          name: string
          source?: Database["public"]["Enums"]["content_source"]
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          name?: string
          source?: Database["public"]["Enums"]["content_source"]
        }
        Relationships: [
          {
            foreignKeyName: "tags_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_capabilities: {
        Row: {
          capability: Database["public"]["Enums"]["membership_capability"]
          created_at: string
          tier_id: string
        }
        Insert: {
          capability: Database["public"]["Enums"]["membership_capability"]
          created_at?: string
          tier_id: string
        }
        Update: {
          capability?: Database["public"]["Enums"]["membership_capability"]
          created_at?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_capabilities_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          awarded_by_user_id: string | null
          badge_id: string
          context: string | null
          id: string
          metadata: Json
          revoked_at: string | null
          tier: string | null
          user_id: string
        }
        Insert: {
          awarded_at?: string
          awarded_by_user_id?: string | null
          badge_id: string
          context?: string | null
          id?: string
          metadata?: Json
          revoked_at?: string | null
          tier?: string | null
          user_id: string
        }
        Update: {
          awarded_at?: string
          awarded_by_user_id?: string | null
          badge_id?: string
          context?: string | null
          id?: string
          metadata?: Json
          revoked_at?: string | null
          tier?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_awarded_by_user_id_fkey"
            columns: ["awarded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_user_id: string
          blocker_user_id: string
          created_at: string
        }
        Insert: {
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_user_id_fkey"
            columns: ["blocker_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          digest_frequency: string
          discoverable_directory: boolean
          discoverable_search_engines: boolean
          dm_privacy: string
          location_granularity: string
          preferences: Json
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_frequency?: string
          discoverable_directory?: boolean
          discoverable_search_engines?: boolean
          dm_privacy?: string
          location_granularity?: string
          preferences?: Json
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_frequency?: string
          discoverable_directory?: boolean
          discoverable_search_engines?: boolean
          dm_privacy?: string
          location_granularity?: string
          preferences?: Json
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deletion_requested_at: string | null
          email: string | null
          id: string
          is_ai: boolean
          low_bandwidth_enabled: boolean
          onboarding_state: Json
          phone: string | null
          preferred_language: Database["public"]["Enums"]["language_code"]
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deletion_requested_at?: string | null
          email?: string | null
          id: string
          is_ai?: boolean
          low_bandwidth_enabled?: boolean
          onboarding_state?: Json
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["language_code"]
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deletion_requested_at?: string | null
          email?: string | null
          id?: string
          is_ai?: boolean
          low_bandwidth_enabled?: boolean
          onboarding_state?: Json
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["language_code"]
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      venture_candidates: {
        Row: {
          ask: string | null
          co_lab_id: string | null
          cover_blurhash: string | null
          cover_path: string | null
          created_at: string
          created_by_user_id: string
          decided_at: string | null
          funded_at: string | null
          id: string
          lab_id: string
          logo_blurhash: string | null
          logo_path: string | null
          name: string
          notes: string | null
          one_liner: string | null
          problem: string | null
          region_gated: boolean
          rubric_feasibility_score: number | null
          rubric_team_score: number | null
          rubric_traction_score: number | null
          solution: string | null
          status: Database["public"]["Enums"]["candidate_status"]
          status_reason: string | null
          submitted_at: string | null
          team: string | null
          timeline_public: boolean
          traction: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["candidate_visibility"]
          vote_closes_at: string | null
          vote_opens_at: string | null
        }
        Insert: {
          ask?: string | null
          co_lab_id?: string | null
          cover_blurhash?: string | null
          cover_path?: string | null
          created_at?: string
          created_by_user_id: string
          decided_at?: string | null
          funded_at?: string | null
          id?: string
          lab_id: string
          logo_blurhash?: string | null
          logo_path?: string | null
          name: string
          notes?: string | null
          one_liner?: string | null
          problem?: string | null
          region_gated?: boolean
          rubric_feasibility_score?: number | null
          rubric_team_score?: number | null
          rubric_traction_score?: number | null
          solution?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          status_reason?: string | null
          submitted_at?: string | null
          team?: string | null
          timeline_public?: boolean
          traction?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["candidate_visibility"]
          vote_closes_at?: string | null
          vote_opens_at?: string | null
        }
        Update: {
          ask?: string | null
          co_lab_id?: string | null
          cover_blurhash?: string | null
          cover_path?: string | null
          created_at?: string
          created_by_user_id?: string
          decided_at?: string | null
          funded_at?: string | null
          id?: string
          lab_id?: string
          logo_blurhash?: string | null
          logo_path?: string | null
          name?: string
          notes?: string | null
          one_liner?: string | null
          problem?: string | null
          region_gated?: boolean
          rubric_feasibility_score?: number | null
          rubric_team_score?: number | null
          rubric_traction_score?: number | null
          solution?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          status_reason?: string | null
          submitted_at?: string | null
          team?: string | null
          timeline_public?: boolean
          traction?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["candidate_visibility"]
          vote_closes_at?: string | null
          vote_opens_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venture_candidates_co_lab_id_fkey"
            columns: ["co_lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venture_candidates_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venture_candidates_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      verifications: {
        Row: {
          consent_given: boolean
          consent_recorded_at: string | null
          created_at: string
          decided_at: string | null
          decision_notes: string | null
          id: string
          listing_id: string | null
          recording_expires_at: string | null
          recording_url: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["verification_request_status"]
          type: Database["public"]["Enums"]["verification_type"]
          updated_at: string
          user_id: string
          verifier_user_id: string | null
        }
        Insert: {
          consent_given?: boolean
          consent_recorded_at?: string | null
          created_at?: string
          decided_at?: string | null
          decision_notes?: string | null
          id?: string
          listing_id?: string | null
          recording_expires_at?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["verification_request_status"]
          type: Database["public"]["Enums"]["verification_type"]
          updated_at?: string
          user_id: string
          verifier_user_id?: string | null
        }
        Update: {
          consent_given?: boolean
          consent_recorded_at?: string | null
          created_at?: string
          decided_at?: string | null
          decision_notes?: string | null
          id?: string
          listing_id?: string | null
          recording_expires_at?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["verification_request_status"]
          type?: Database["public"]["Enums"]["verification_type"]
          updated_at?: string
          user_id?: string
          verifier_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verifications_listing_fk"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "business_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_listing_fk"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "following_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_verifier_user_id_fkey"
            columns: ["verifier_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vouches: {
        Row: {
          created_at: string
          id: string
          vouchee_user_id: string
          voucher_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          vouchee_user_id: string
          voucher_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          vouchee_user_id?: string
          voucher_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouches_vouchee_user_id_fkey"
            columns: ["vouchee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouches_voucher_user_id_fkey"
            columns: ["voucher_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          created_at: string
          email: string | null
          id: string
          invite_id: string | null
          invited_at: string | null
          phone: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          invite_id?: string | null
          invited_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          invite_id?: string | null
          invited_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          api_key_id: string | null
          created_at: string
          event_types: string[]
          id: string
          is_active: boolean
          last_delivery_at: string | null
          owner_user_id: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          owner_user_id: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          owner_user_id?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      following_feed: {
        Row: {
          item_id: string | null
          item_type: string | null
          lab_id: string | null
          sort_ts: string | null
        }
        Relationships: []
      }
      following_listings: {
        Row: {
          address: string | null
          business_name: string | null
          category_id: string | null
          city: string | null
          contact_links: Json | null
          country: string | null
          created_at: string | null
          export_checklist: Json | null
          export_readiness_score: number | null
          id: string | null
          landmark: string | null
          latitude: number | null
          longitude: number | null
          owner_user_id: string | null
          search_norm: string | null
          short_description: string | null
          source: Database["public"]["Enums"]["content_source"] | null
          status: Database["public"]["Enums"]["content_status"] | null
          updated_at: string | null
          verification_status:
            | Database["public"]["Enums"]["listing_verification_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "business_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "listing_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_listings_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_read_candidate: { Args: { cand: string }; Returns: boolean }
      can_read_lab: { Args: { p_lab_id: string }; Returns: boolean }
      can_read_lab_roster: { Args: { p_lab_id: string }; Returns: boolean }
      can_review_candidate: { Args: { cand: string }; Returns: boolean }
      candidate_interest_counts: {
        Args: { cand: string }
        Returns: {
          cosign: number
          help: number
          invest: number
        }[]
      }
      candidate_vote_tally: {
        Args: { cand: string }
        Returns: {
          approve: number
          reject: number
          total: number
        }[]
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dearmor: { Args: { "": string }; Returns: string }
      dm_inbox: {
        Args: { p_before?: string; p_before_id?: string; p_limit?: number }
        Returns: {
          conversation_id: string
          created_at: string
          is_initiator: boolean
          last_message_at: string
          last_message_body: string
          last_message_deleted: boolean
          last_message_sender: string
          other_user_id: string
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
        }[]
      }
      dm_unread_count: { Args: never; Returns: number }
      flag_skill_gaps: {
        Args: never
        Returns: {
          lab_id: string
          skill: string
        }[]
      }
      gen_random_uuid: { Args: never; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      get_signup_mode: { Args: never; Returns: string }
      has_capability: {
        Args: { cap: Database["public"]["Enums"]["membership_capability"] }
        Returns: boolean
      }
      has_password: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_candidate_lab_member: { Args: { cand: string }; Returns: boolean }
      is_lab_member: { Args: { p_lab_id: string }; Returns: boolean }
      is_mod: { Args: never; Returns: boolean }
      is_supporter: { Args: never; Returns: boolean }
      list_visible_tiers: {
        Args: never
        Returns: {
          capabilities: Database["public"]["Enums"]["membership_capability"][]
          id: string
          monthly_price_usd: number
          name: string
          position: number
        }[]
      }
      mark_dormant_labs: { Args: never; Returns: string[] }
      normalize_auth_phone: { Args: { p: string }; Returns: string }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      poll_results: {
        Args: { p_post_id: string }
        Returns: {
          poll_option_id: string
          votes: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      xidig_name_norm: { Args: { input: string }; Returns: string }
    }
    Enums: {
      account_status:
        | "active"
        | "suspended"
        | "deactivated"
        | "pending_deletion"
        | "deleted"
      appeal_status: "pending" | "upheld" | "overturned"
      ask_status: "open" | "answered" | "closed"
      award_category:
        | "best_lab"
        | "best_win"
        | "most_helpful"
        | "rising_builder"
      candidate_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "approved"
        | "parked"
        | "declined"
      candidate_visibility: "all_members" | "reviewers_only"
      claim_status: "pending" | "approved" | "rejected"
      consent_type:
        | "terms_of_service"
        | "privacy_policy"
        | "cookies"
        | "analytics"
      content_source: "member" | "seed" | "ai"
      content_status: "published" | "hidden" | "removed"
      conversation_status: "pending" | "accepted" | "declined" | "blocked"
      entity_type:
        | "user"
        | "profile"
        | "post"
        | "comment"
        | "tag"
        | "lab"
        | "lab_update"
        | "lab_artifact"
        | "lab_decision"
        | "candidate"
        | "listing"
        | "conversation"
        | "message"
        | "badge"
        | "vouch"
        | "report"
        | "invite"
        | "verification"
        | "interest"
        | "api_key"
        | "governance_entry"
        | "appeal"
        | "mod_action"
        | "listing_claim"
        | "waitlist_entry"
        | "lab_event"
        | "award_vote"
        | "push_subscription"
        | "webhook_endpoint"
        | "membership_tier"
        | "consent_record"
        | "capital_gate_evaluation"
        | "media_upload"
      follow_target_type: "user" | "lab" | "candidate" | "tag"
      interest_type: "help" | "cosign" | "invest"
      lab_collaboration_status: "proposed" | "accepted" | "declined" | "ended"
      lab_join_mode: "open" | "request" | "invite"
      lab_member_role: "lead" | "core" | "member" | "observer"
      lab_member_specialization: "operator" | "researcher" | "advisor"
      lab_member_status:
        | "invited"
        | "requested"
        | "active"
        | "declined"
        | "removed"
        | "left"
      lab_stage: "idea" | "building" | "validating" | "launched"
      lab_visibility: "private" | "members" | "public"
      language_code: "en" | "so"
      listing_verification_status: "unverified" | "pending" | "verified"
      media_scan_status: "passed" | "uncertain" | "skipped" | "removed"
      membership_capability:
        | "create_lab"
        | "join_unlimited_labs"
        | "vote_candidate"
        | "governance_rights"
        | "builder_path"
        | "investor_path"
        | "intelligence_updates"
      mod_action_type:
        | "remove_content"
        | "restore_content"
        | "hide_content"
        | "warn_user"
        | "suspend_user"
        | "unsuspend_user"
        | "remove_listing"
        | "restore_listing"
        | "verify_user"
        | "revoke_verification"
        | "dismiss_report"
        | "other"
      moderation_review_reason: "ai_flagged" | "ai_uncertain"
      moderation_review_status: "pending" | "approved" | "removed" | "dismissed"
      poll_status: "open" | "closed"
      post_type: "intro" | "ask" | "win" | "update" | "poll"
      profile_verification_status:
        | "unverified"
        | "pending"
        | "community_verified"
        | "identity_verified"
      reaction_type: "fire" | "strong" | "mashallah" | "idea" | "watching"
      report_reason:
        | "spam"
        | "harassment"
        | "impersonation"
        | "fraud_or_scam"
        | "inappropriate_content"
        | "misinformation"
        | "other"
      report_status: "open" | "in_review" | "resolved" | "dismissed"
      space_mode: "club" | "lab"
      user_role: "member" | "mod" | "admin"
      verification_request_status:
        | "pending"
        | "scheduled"
        | "approved"
        | "rejected"
        | "cancelled"
      verification_type: "identity" | "business"
      vote_choice: "approve" | "reject"
      waitlist_status: "pending" | "invited" | "joined"
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
      account_status: [
        "active",
        "suspended",
        "deactivated",
        "pending_deletion",
        "deleted",
      ],
      appeal_status: ["pending", "upheld", "overturned"],
      ask_status: ["open", "answered", "closed"],
      award_category: [
        "best_lab",
        "best_win",
        "most_helpful",
        "rising_builder",
      ],
      candidate_status: [
        "draft",
        "submitted",
        "in_review",
        "approved",
        "parked",
        "declined",
      ],
      candidate_visibility: ["all_members", "reviewers_only"],
      claim_status: ["pending", "approved", "rejected"],
      consent_type: [
        "terms_of_service",
        "privacy_policy",
        "cookies",
        "analytics",
      ],
      content_source: ["member", "seed", "ai"],
      content_status: ["published", "hidden", "removed"],
      conversation_status: ["pending", "accepted", "declined", "blocked"],
      entity_type: [
        "user",
        "profile",
        "post",
        "comment",
        "tag",
        "lab",
        "lab_update",
        "lab_artifact",
        "lab_decision",
        "candidate",
        "listing",
        "conversation",
        "message",
        "badge",
        "vouch",
        "report",
        "invite",
        "verification",
        "interest",
        "api_key",
        "governance_entry",
        "appeal",
        "mod_action",
        "listing_claim",
        "waitlist_entry",
        "lab_event",
        "award_vote",
        "push_subscription",
        "webhook_endpoint",
        "membership_tier",
        "consent_record",
        "capital_gate_evaluation",
        "media_upload",
      ],
      follow_target_type: ["user", "lab", "candidate", "tag"],
      interest_type: ["help", "cosign", "invest"],
      lab_collaboration_status: ["proposed", "accepted", "declined", "ended"],
      lab_join_mode: ["open", "request", "invite"],
      lab_member_role: ["lead", "core", "member", "observer"],
      lab_member_specialization: ["operator", "researcher", "advisor"],
      lab_member_status: [
        "invited",
        "requested",
        "active",
        "declined",
        "removed",
        "left",
      ],
      lab_stage: ["idea", "building", "validating", "launched"],
      lab_visibility: ["private", "members", "public"],
      language_code: ["en", "so"],
      listing_verification_status: ["unverified", "pending", "verified"],
      media_scan_status: ["passed", "uncertain", "skipped", "removed"],
      membership_capability: [
        "create_lab",
        "join_unlimited_labs",
        "vote_candidate",
        "governance_rights",
        "builder_path",
        "investor_path",
        "intelligence_updates",
      ],
      mod_action_type: [
        "remove_content",
        "restore_content",
        "hide_content",
        "warn_user",
        "suspend_user",
        "unsuspend_user",
        "remove_listing",
        "restore_listing",
        "verify_user",
        "revoke_verification",
        "dismiss_report",
        "other",
      ],
      moderation_review_reason: ["ai_flagged", "ai_uncertain"],
      moderation_review_status: ["pending", "approved", "removed", "dismissed"],
      poll_status: ["open", "closed"],
      post_type: ["intro", "ask", "win", "update", "poll"],
      profile_verification_status: [
        "unverified",
        "pending",
        "community_verified",
        "identity_verified",
      ],
      reaction_type: ["fire", "strong", "mashallah", "idea", "watching"],
      report_reason: [
        "spam",
        "harassment",
        "impersonation",
        "fraud_or_scam",
        "inappropriate_content",
        "misinformation",
        "other",
      ],
      report_status: ["open", "in_review", "resolved", "dismissed"],
      space_mode: ["club", "lab"],
      user_role: ["member", "mod", "admin"],
      verification_request_status: [
        "pending",
        "scheduled",
        "approved",
        "rejected",
        "cancelled",
      ],
      verification_type: ["identity", "business"],
      vote_choice: ["approve", "reject"],
      waitlist_status: ["pending", "invited", "joined"],
    },
  },
} as const

