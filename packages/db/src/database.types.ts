// AUTO-GENERATED from the migrations in supabase/migrations — do not edit.
//
// Regenerate with `pnpm gen-types:local` (embedded-postgres, no Supabase
// project or Docker needed). Once a hosted project exists, `pnpm gen-types`
// against the project ref should produce an equivalent Database shape.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      api_keys: {
        Row: {
          id: string
          owner_user_id: string
          name: string
          key_hash: string
          key_prefix: string
          scopes: string[]
          last_used_at: string | null
          expires_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          owner_user_id: string
          name: string
          key_hash: string
          key_prefix: string
          scopes?: string[]
          last_used_at?: string | null
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          owner_user_id?: string
          name?: string
          key_hash?: string
          key_prefix?: string
          scopes?: string[]
          last_used_at?: string | null
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      appeals: {
        Row: {
          id: string
          mod_action_id: string
          appellant_user_id: string
          body: string
          status: Database['public']['Enums']['appeal_status']
          reviewed_by_user_id: string | null
          decision_notes: string | null
          decided_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          mod_action_id: string
          appellant_user_id: string
          body: string
          status?: Database['public']['Enums']['appeal_status']
          reviewed_by_user_id?: string | null
          decision_notes?: string | null
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          mod_action_id?: string
          appellant_user_id?: string
          body?: string
          status?: Database['public']['Enums']['appeal_status']
          reviewed_by_user_id?: string | null
          decision_notes?: string | null
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          actor_user_id: string | null
          api_key_id: string | null
          action: string
          target_type: Database['public']['Enums']['entity_type'] | null
          target_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor_user_id?: string | null
          api_key_id?: string | null
          action: string
          target_type?: Database['public']['Enums']['entity_type'] | null
          target_id?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          actor_user_id?: string | null
          api_key_id?: string | null
          action?: string
          target_type?: Database['public']['Enums']['entity_type'] | null
          target_id?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      auth_email_tokens: {
        Row: {
          token_hash: string
          user_id: string | null
          email: string
          type: string
          created_at: string
          consumed_at: string | null
        }
        Insert: {
          token_hash: string
          user_id?: string | null
          email: string
          type: string
          created_at?: string
          consumed_at?: string | null
        }
        Update: {
          token_hash?: string
          user_id?: string | null
          email?: string
          type?: string
          created_at?: string
          consumed_at?: string | null
        }
        Relationships: []
      }
      award_votes: {
        Row: {
          id: string
          quarter: string
          category: Database['public']['Enums']['award_category']
          voter_user_id: string
          target_type: Database['public']['Enums']['entity_type']
          target_id: string
          created_at: string
        }
        Insert: {
          id?: string
          quarter: string
          category: Database['public']['Enums']['award_category']
          voter_user_id: string
          target_type: Database['public']['Enums']['entity_type']
          target_id: string
          created_at?: string
        }
        Update: {
          id?: string
          quarter?: string
          category?: Database['public']['Enums']['award_category']
          voter_user_id?: string
          target_type?: Database['public']['Enums']['entity_type']
          target_id?: string
          created_at?: string
        }
        Relationships: []
      }
      badge_definitions: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      business_listings: {
        Row: {
          id: string
          owner_user_id: string | null
          business_name: string
          category_id: string
          short_description: string | null
          address: string | null
          landmark: string | null
          latitude: number | null
          longitude: number | null
          city: string | null
          country: string | null
          contact_links: Json
          verification_status: Database['public']['Enums']['listing_verification_status']
          status: Database['public']['Enums']['content_status']
          source: Database['public']['Enums']['content_source']
          export_checklist: Json | null
          export_readiness_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_user_id?: string | null
          business_name: string
          category_id: string
          short_description?: string | null
          address?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          city?: string | null
          country?: string | null
          contact_links?: Json
          verification_status?: Database['public']['Enums']['listing_verification_status']
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          export_checklist?: Json | null
          export_readiness_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_user_id?: string | null
          business_name?: string
          category_id?: string
          short_description?: string | null
          address?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          city?: string | null
          country?: string | null
          contact_links?: Json
          verification_status?: Database['public']['Enums']['listing_verification_status']
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          export_checklist?: Json | null
          export_readiness_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidate_reviews: {
        Row: {
          id: string
          candidate_id: string
          reviewer_user_id: string
          team_score: number | null
          traction_score: number | null
          feasibility_score: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          reviewer_user_id: string
          team_score?: number | null
          traction_score?: number | null
          feasibility_score?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
          reviewer_user_id?: string
          team_score?: number | null
          traction_score?: number | null
          feasibility_score?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidate_votes: {
        Row: {
          id: string
          candidate_id: string
          voter_user_id: string
          vote: Database['public']['Enums']['vote_choice']
          created_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          voter_user_id: string
          vote: Database['public']['Enums']['vote_choice']
          created_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
          voter_user_id?: string
          vote?: Database['public']['Enums']['vote_choice']
          created_at?: string
        }
        Relationships: []
      }
      capital_gate_evaluations: {
        Row: {
          id: string
          user_id: string
          profile_country: string | null
          geo_ip_country: string | null
          attested: boolean
          granted: boolean
          reason: string | null
          candidate_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          profile_country?: string | null
          geo_ip_country?: string | null
          attested?: boolean
          granted: boolean
          reason?: string | null
          candidate_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          profile_country?: string | null
          geo_ip_country?: string | null
          attested?: boolean
          granted?: boolean
          reason?: string | null
          candidate_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          id: string
          post_id: string | null
          candidate_id: string | null
          author_user_id: string
          body: string
          is_credited_answer: boolean
          status: Database['public']['Enums']['content_status']
          source: Database['public']['Enums']['content_source']
          edited_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          post_id?: string | null
          candidate_id?: string | null
          author_user_id: string
          body: string
          is_credited_answer?: boolean
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          edited_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          post_id?: string | null
          candidate_id?: string | null
          author_user_id?: string
          body?: string
          is_credited_answer?: boolean
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          edited_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          id: string
          user_id: string
          consent_type: Database['public']['Enums']['consent_type']
          version: string
          method: string | null
          document_url: string | null
          granted_at: string
          withdrawn_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          consent_type: Database['public']['Enums']['consent_type']
          version: string
          method?: string | null
          document_url?: string | null
          granted_at?: string
          withdrawn_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          consent_type?: Database['public']['Enums']['consent_type']
          version?: string
          method?: string | null
          document_url?: string | null
          granted_at?: string
          withdrawn_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          initiator_user_id: string
          recipient_user_id: string
          status: Database['public']['Enums']['conversation_status']
          initiator_last_read_at: string | null
          recipient_last_read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          initiator_user_id: string
          recipient_user_id: string
          status?: Database['public']['Enums']['conversation_status']
          initiator_last_read_at?: string | null
          recipient_last_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          initiator_user_id?: string
          recipient_user_id?: string
          status?: Database['public']['Enums']['conversation_status']
          initiator_last_read_at?: string | null
          recipient_last_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          id: string
          follower_user_id: string
          target_type: Database['public']['Enums']['follow_target_type']
          target_id: string
          created_at: string
        }
        Insert: {
          id?: string
          follower_user_id: string
          target_type: Database['public']['Enums']['follow_target_type']
          target_id: string
          created_at?: string
        }
        Update: {
          id?: string
          follower_user_id?: string
          target_type?: Database['public']['Enums']['follow_target_type']
          target_id?: string
          created_at?: string
        }
        Relationships: []
      }
      governance_log_entries: {
        Row: {
          id: string
          title: string
          body: string
          category: string | null
          created_by_user_id: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          body: string
          category?: string | null
          created_by_user_id?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          body?: string
          category?: string | null
          created_by_user_id?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      interests: {
        Row: {
          id: string
          candidate_id: string | null
          user_id: string
          type: Database['public']['Enums']['interest_type']
          message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          candidate_id?: string | null
          user_id: string
          type: Database['public']['Enums']['interest_type']
          message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string | null
          user_id?: string
          type?: Database['public']['Enums']['interest_type']
          message?: string | null
          created_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          id: string
          code: string
          created_by_user_id: string | null
          note: string | null
          expires_at: string | null
          revoked_at: string | null
          redeemed_by_user_id: string | null
          redeemed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          created_by_user_id?: string | null
          note?: string | null
          expires_at?: string | null
          revoked_at?: string | null
          redeemed_by_user_id?: string | null
          redeemed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          created_by_user_id?: string | null
          note?: string | null
          expires_at?: string | null
          revoked_at?: string | null
          redeemed_by_user_id?: string | null
          redeemed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lab_artifacts: {
        Row: {
          id: string
          lab_id: string
          added_by_user_id: string
          title: string
          url: string
          description: string | null
          status: Database['public']['Enums']['content_status']
          created_at: string
        }
        Insert: {
          id?: string
          lab_id: string
          added_by_user_id: string
          title: string
          url: string
          description?: string | null
          status?: Database['public']['Enums']['content_status']
          created_at?: string
        }
        Update: {
          id?: string
          lab_id?: string
          added_by_user_id?: string
          title?: string
          url?: string
          description?: string | null
          status?: Database['public']['Enums']['content_status']
          created_at?: string
        }
        Relationships: []
      }
      lab_collaborations: {
        Row: {
          id: string
          lab_a_id: string
          lab_b_id: string
          status: Database['public']['Enums']['lab_collaboration_status']
          proposed_by_user_id: string | null
          responded_at: string | null
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lab_a_id: string
          lab_b_id: string
          status?: Database['public']['Enums']['lab_collaboration_status']
          proposed_by_user_id?: string | null
          responded_at?: string | null
          ended_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lab_a_id?: string
          lab_b_id?: string
          status?: Database['public']['Enums']['lab_collaboration_status']
          proposed_by_user_id?: string | null
          responded_at?: string | null
          ended_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lab_decisions: {
        Row: {
          id: string
          lab_id: string
          created_by_user_id: string
          title: string
          context: string | null
          decision: string
          status: Database['public']['Enums']['content_status']
          decided_at: string
          created_at: string
        }
        Insert: {
          id?: string
          lab_id: string
          created_by_user_id: string
          title: string
          context?: string | null
          decision: string
          status?: Database['public']['Enums']['content_status']
          decided_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          lab_id?: string
          created_by_user_id?: string
          title?: string
          context?: string | null
          decision?: string
          status?: Database['public']['Enums']['content_status']
          decided_at?: string
          created_at?: string
        }
        Relationships: []
      }
      lab_events: {
        Row: {
          id: string
          lab_id: string
          actor_user_id: string | null
          event_type: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          lab_id: string
          actor_user_id?: string | null
          event_type: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          lab_id?: string
          actor_user_id?: string | null
          event_type?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      lab_members: {
        Row: {
          lab_id: string
          user_id: string
          role: Database['public']['Enums']['lab_member_role']
          specialization: Database['public']['Enums']['lab_member_specialization'] | null
          status: Database['public']['Enums']['lab_member_status']
          invited_by_user_id: string | null
          requested_at: string | null
          joined_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          lab_id: string
          user_id: string
          role?: Database['public']['Enums']['lab_member_role']
          specialization?: Database['public']['Enums']['lab_member_specialization'] | null
          status?: Database['public']['Enums']['lab_member_status']
          invited_by_user_id?: string | null
          requested_at?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          lab_id?: string
          user_id?: string
          role?: Database['public']['Enums']['lab_member_role']
          specialization?: Database['public']['Enums']['lab_member_specialization'] | null
          status?: Database['public']['Enums']['lab_member_status']
          invited_by_user_id?: string | null
          requested_at?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lab_playbooks: {
        Row: {
          id: string
          slug: string
          name: string
          venture_type: string
          template: Json
          source: Database['public']['Enums']['content_source']
          is_active: boolean
          created_by_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          venture_type: string
          template?: Json
          source?: Database['public']['Enums']['content_source']
          is_active?: boolean
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          venture_type?: string
          template?: Json
          source?: Database['public']['Enums']['content_source']
          is_active?: boolean
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lab_skill_needs: {
        Row: {
          id: string
          lab_id: string
          skill: string
          created_at: string
          alerted_at: string | null
          filled_at: string | null
          filled_by_user_id: string | null
        }
        Insert: {
          id?: string
          lab_id: string
          skill: string
          created_at?: string
          alerted_at?: string | null
          filled_at?: string | null
          filled_by_user_id?: string | null
        }
        Update: {
          id?: string
          lab_id?: string
          skill?: string
          created_at?: string
          alerted_at?: string | null
          filled_at?: string | null
          filled_by_user_id?: string | null
        }
        Relationships: []
      }
      lab_tags: {
        Row: {
          lab_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          lab_id: string
          tag_id: string
          created_at?: string
        }
        Update: {
          lab_id?: string
          tag_id?: string
          created_at?: string
        }
        Relationships: []
      }
      lab_updates: {
        Row: {
          id: string
          lab_id: string
          author_user_id: string
          title: string | null
          body: string
          collaboration_id: string | null
          status: Database['public']['Enums']['content_status']
          source: Database['public']['Enums']['content_source']
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lab_id: string
          author_user_id: string
          title?: string | null
          body: string
          collaboration_id?: string | null
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lab_id?: string
          author_user_id?: string
          title?: string | null
          body?: string
          collaboration_id?: string | null
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      labs: {
        Row: {
          id: string
          name: string
          slug: string
          space_mode: Database['public']['Enums']['space_mode']
          short_description: string | null
          problem_statement: string | null
          hypothesis: string | null
          sprint_length_weeks: number | null
          sprint_deadline: string | null
          success_definition: string | null
          charter_completed_at: string | null
          promoted_at: string | null
          stage: Database['public']['Enums']['lab_stage']
          visibility: Database['public']['Enums']['lab_visibility']
          is_listed: boolean
          is_supporter_only: boolean
          member_list_visibility: Database['public']['Enums']['lab_visibility']
          join_mode: Database['public']['Enums']['lab_join_mode']
          lead_user_id: string
          playbook_id: string | null
          source: Database['public']['Enums']['content_source']
          settings: Json
          last_activity_at: string
          dormant_since: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          space_mode?: Database['public']['Enums']['space_mode']
          short_description?: string | null
          problem_statement?: string | null
          hypothesis?: string | null
          sprint_length_weeks?: number | null
          sprint_deadline?: string | null
          success_definition?: string | null
          charter_completed_at?: string | null
          promoted_at?: string | null
          stage?: Database['public']['Enums']['lab_stage']
          visibility?: Database['public']['Enums']['lab_visibility']
          is_listed?: boolean
          is_supporter_only?: boolean
          member_list_visibility?: Database['public']['Enums']['lab_visibility']
          join_mode?: Database['public']['Enums']['lab_join_mode']
          lead_user_id: string
          playbook_id?: string | null
          source?: Database['public']['Enums']['content_source']
          settings?: Json
          last_activity_at?: string
          dormant_since?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          space_mode?: Database['public']['Enums']['space_mode']
          short_description?: string | null
          problem_statement?: string | null
          hypothesis?: string | null
          sprint_length_weeks?: number | null
          sprint_deadline?: string | null
          success_definition?: string | null
          charter_completed_at?: string | null
          promoted_at?: string | null
          stage?: Database['public']['Enums']['lab_stage']
          visibility?: Database['public']['Enums']['lab_visibility']
          is_listed?: boolean
          is_supporter_only?: boolean
          member_list_visibility?: Database['public']['Enums']['lab_visibility']
          join_mode?: Database['public']['Enums']['lab_join_mode']
          lead_user_id?: string
          playbook_id?: string | null
          source?: Database['public']['Enums']['content_source']
          settings?: Json
          last_activity_at?: string
          dormant_since?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      listing_categories: {
        Row: {
          id: string
          slug: string
          name_en: string
          name_so: string | null
          position: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name_en: string
          name_so?: string | null
          position?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name_en?: string
          name_so?: string | null
          position?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      listing_claims: {
        Row: {
          id: string
          listing_id: string
          claimant_user_id: string
          evidence: string | null
          status: Database['public']['Enums']['claim_status']
          reviewed_by_user_id: string | null
          decided_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          listing_id: string
          claimant_user_id: string
          evidence?: string | null
          status?: Database['public']['Enums']['claim_status']
          reviewed_by_user_id?: string | null
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          listing_id?: string
          claimant_user_id?: string
          evidence?: string | null
          status?: Database['public']['Enums']['claim_status']
          reviewed_by_user_id?: string | null
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      listing_tags: {
        Row: {
          listing_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          listing_id: string
          tag_id: string
          created_at?: string
        }
        Update: {
          listing_id?: string
          tag_id?: string
          created_at?: string
        }
        Relationships: []
      }
      membership_tiers: {
        Row: {
          id: string
          name: string
          monthly_price_usd: number
          position: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          monthly_price_usd?: number
          position: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          monthly_price_usd?: number
          position?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_user_id: string
          body: string
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_user_id: string
          body: string
          deleted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_user_id?: string
          body?: string
          deleted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      mod_actions: {
        Row: {
          id: string
          actor_user_id: string
          action: Database['public']['Enums']['mod_action_type']
          target_type: Database['public']['Enums']['entity_type']
          target_id: string
          report_id: string | null
          reason: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor_user_id: string
          action: Database['public']['Enums']['mod_action_type']
          target_type: Database['public']['Enums']['entity_type']
          target_id: string
          report_id?: string | null
          reason?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          actor_user_id?: string
          action?: Database['public']['Enums']['mod_action_type']
          target_type?: Database['public']['Enums']['entity_type']
          target_id?: string
          report_id?: string | null
          reason?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          actor_user_id: string | null
          type: string
          entity_type: Database['public']['Enums']['entity_type'] | null
          entity_id: string | null
          payload: Json
          bundle_key: string | null
          read_at: string | null
          emailed_at: string | null
          pushed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          actor_user_id?: string | null
          type: string
          entity_type?: Database['public']['Enums']['entity_type'] | null
          entity_id?: string | null
          payload?: Json
          bundle_key?: string | null
          read_at?: string | null
          emailed_at?: string | null
          pushed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          actor_user_id?: string | null
          type?: string
          entity_type?: Database['public']['Enums']['entity_type'] | null
          entity_id?: string | null
          payload?: Json
          bundle_key?: string | null
          read_at?: string | null
          emailed_at?: string | null
          pushed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          id: string
          post_id: string
          post_type: Database['public']['Enums']['post_type']
          label: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          post_type?: Database['public']['Enums']['post_type']
          label: string
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          post_type?: Database['public']['Enums']['post_type']
          label?: string
          position?: number
          created_at?: string
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          id: string
          post_id: string
          poll_option_id: string
          voter_user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          post_id: string
          poll_option_id: string
          voter_user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          poll_option_id?: string
          voter_user_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_tags: {
        Row: {
          post_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          post_id: string
          tag_id: string
          created_at?: string
        }
        Update: {
          post_id?: string
          tag_id?: string
          created_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          id: string
          author_user_id: string
          lab_id: string | null
          type: Database['public']['Enums']['post_type']
          title: string | null
          body: string
          link_url: string | null
          image_urls: string[]
          ask_status: Database['public']['Enums']['ask_status'] | null
          ask_nudged_at: string | null
          poll_status: Database['public']['Enums']['poll_status'] | null
          poll_closes_at: string | null
          status: Database['public']['Enums']['content_status']
          source: Database['public']['Enums']['content_source']
          pinned_at: string | null
          edited_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_user_id: string
          lab_id?: string | null
          type: Database['public']['Enums']['post_type']
          title?: string | null
          body: string
          link_url?: string | null
          image_urls?: string[]
          ask_status?: Database['public']['Enums']['ask_status'] | null
          ask_nudged_at?: string | null
          poll_status?: Database['public']['Enums']['poll_status'] | null
          poll_closes_at?: string | null
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          pinned_at?: string | null
          edited_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_user_id?: string
          lab_id?: string | null
          type?: Database['public']['Enums']['post_type']
          title?: string | null
          body?: string
          link_url?: string | null
          image_urls?: string[]
          ask_status?: Database['public']['Enums']['ask_status'] | null
          ask_nudged_at?: string | null
          poll_status?: Database['public']['Enums']['poll_status'] | null
          poll_closes_at?: string | null
          status?: Database['public']['Enums']['content_status']
          source?: Database['public']['Enums']['content_source']
          pinned_at?: string | null
          edited_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_pinned_labs: {
        Row: {
          user_id: string
          lab_id: string
          position: number
          created_at: string
        }
        Insert: {
          user_id: string
          lab_id: string
          position: number
          created_at?: string
        }
        Update: {
          user_id?: string
          lab_id?: string
          position?: number
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          user_id: string
          display_name: string
          handle: string
          bio: string | null
          location_city: string | null
          location_country: string | null
          latitude: number | null
          longitude: number | null
          timezone: string | null
          skills: string[]
          lanes: string[]
          links: Json
          contact_options: Json
          verification_status: Database['public']['Enums']['profile_verification_status']
          membership_tier_id: string
          subscription_status: string | null
          region_verified: boolean
          region_attested_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name: string
          handle: string
          bio?: string | null
          location_city?: string | null
          location_country?: string | null
          latitude?: number | null
          longitude?: number | null
          timezone?: string | null
          skills?: string[]
          lanes?: string[]
          links?: Json
          contact_options?: Json
          verification_status?: Database['public']['Enums']['profile_verification_status']
          membership_tier_id?: string
          subscription_status?: string | null
          region_verified?: boolean
          region_attested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string
          handle?: string
          bio?: string | null
          location_city?: string | null
          location_country?: string | null
          latitude?: number | null
          longitude?: number | null
          timezone?: string | null
          skills?: string[]
          lanes?: string[]
          links?: Json
          contact_options?: Json
          verification_status?: Database['public']['Enums']['profile_verification_status']
          membership_tier_id?: string
          subscription_status?: string | null
          region_verified?: boolean
          region_attested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          last_used_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          id: string
          user_id: string
          post_id: string | null
          comment_id: string | null
          type: Database['public']['Enums']['reaction_type']
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          post_id?: string | null
          comment_id?: string | null
          type: Database['public']['Enums']['reaction_type']
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          post_id?: string | null
          comment_id?: string | null
          type?: Database['public']['Enums']['reaction_type']
          created_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          reporter_user_id: string
          target_type: Database['public']['Enums']['entity_type']
          target_id: string
          reason: Database['public']['Enums']['report_reason']
          details: string | null
          status: Database['public']['Enums']['report_status']
          resolution: string | null
          resolved_by_user_id: string | null
          resolved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reporter_user_id: string
          target_type: Database['public']['Enums']['entity_type']
          target_id: string
          reason: Database['public']['Enums']['report_reason']
          details?: string | null
          status?: Database['public']['Enums']['report_status']
          resolution?: string | null
          resolved_by_user_id?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          reporter_user_id?: string
          target_type?: Database['public']['Enums']['entity_type']
          target_id?: string
          reason?: Database['public']['Enums']['report_reason']
          details?: string | null
          status?: Database['public']['Enums']['report_status']
          resolution?: string | null
          resolved_by_user_id?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reputation_events: {
        Row: {
          id: string
          user_id: string
          event_type: string
          points: number
          entity_type: Database['public']['Enums']['entity_type'] | null
          entity_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_type: string
          points: number
          entity_type?: Database['public']['Enums']['entity_type'] | null
          entity_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_type?: string
          points?: number
          entity_type?: Database['public']['Enums']['entity_type'] | null
          entity_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reputation_scores: {
        Row: {
          user_id: string
          contribution_score: number
          helper_score: number
          current_streak_days: number
          longest_streak_days: number
          last_active_on: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          contribution_score?: number
          helper_score?: number
          current_streak_days?: number
          longest_streak_days?: number
          last_active_on?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          contribution_score?: number
          helper_score?: number
          current_streak_days?: number
          longest_streak_days?: number
          last_active_on?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      signup_grants: {
        Row: {
          id: string
          email: string | null
          phone: string | null
          invite_id: string | null
          waitlist_entry_id: string | null
          expires_at: string
          consumed_at: string | null
          consumed_by_user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email?: string | null
          phone?: string | null
          invite_id?: string | null
          waitlist_entry_id?: string | null
          expires_at: string
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          phone?: string | null
          invite_id?: string | null
          waitlist_entry_id?: string | null
          expires_at?: string
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      skill_endorsements: {
        Row: {
          id: string
          endorser_user_id: string
          endorsee_user_id: string
          skill: string
          created_at: string
        }
        Insert: {
          id?: string
          endorser_user_id: string
          endorsee_user_id: string
          skill: string
          created_at?: string
        }
        Update: {
          id?: string
          endorser_user_id?: string
          endorsee_user_id?: string
          skill?: string
          created_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          name: string
          description: string | null
          source: Database['public']['Enums']['content_source']
          created_by_user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          source?: Database['public']['Enums']['content_source']
          created_by_user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          source?: Database['public']['Enums']['content_source']
          created_by_user_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tier_capabilities: {
        Row: {
          tier_id: string
          capability: Database['public']['Enums']['membership_capability']
          created_at: string
        }
        Insert: {
          tier_id: string
          capability: Database['public']['Enums']['membership_capability']
          created_at?: string
        }
        Update: {
          tier_id?: string
          capability?: Database['public']['Enums']['membership_capability']
          created_at?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          id: string
          user_id: string
          badge_id: string
          tier: string | null
          context: string | null
          awarded_by_user_id: string | null
          awarded_at: string
          revoked_at: string | null
          metadata: Json
        }
        Insert: {
          id?: string
          user_id: string
          badge_id: string
          tier?: string | null
          context?: string | null
          awarded_by_user_id?: string | null
          awarded_at?: string
          revoked_at?: string | null
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          badge_id?: string
          tier?: string | null
          context?: string | null
          awarded_by_user_id?: string | null
          awarded_at?: string
          revoked_at?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocker_user_id: string
          blocked_user_id: string
          created_at: string
        }
        Insert: {
          blocker_user_id: string
          blocked_user_id: string
          created_at?: string
        }
        Update: {
          blocker_user_id?: string
          blocked_user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          email: string | null
          phone: string | null
          role: Database['public']['Enums']['user_role']
          status: Database['public']['Enums']['account_status']
          is_ai: boolean
          preferred_language: Database['public']['Enums']['language_code']
          low_bandwidth_enabled: boolean
          onboarding_state: Json
          suspended_at: string | null
          suspension_reason: string | null
          deletion_requested_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          phone?: string | null
          role?: Database['public']['Enums']['user_role']
          status?: Database['public']['Enums']['account_status']
          is_ai?: boolean
          preferred_language?: Database['public']['Enums']['language_code']
          low_bandwidth_enabled?: boolean
          onboarding_state?: Json
          suspended_at?: string | null
          suspension_reason?: string | null
          deletion_requested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          phone?: string | null
          role?: Database['public']['Enums']['user_role']
          status?: Database['public']['Enums']['account_status']
          is_ai?: boolean
          preferred_language?: Database['public']['Enums']['language_code']
          low_bandwidth_enabled?: boolean
          onboarding_state?: Json
          suspended_at?: string | null
          suspension_reason?: string | null
          deletion_requested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      venture_candidates: {
        Row: {
          id: string
          lab_id: string
          co_lab_id: string | null
          created_by_user_id: string
          name: string
          one_liner: string | null
          problem: string | null
          solution: string | null
          traction: string | null
          team: string | null
          ask: string | null
          status: Database['public']['Enums']['candidate_status']
          status_reason: string | null
          visibility: Database['public']['Enums']['candidate_visibility']
          region_gated: boolean
          rubric_team_score: number | null
          rubric_traction_score: number | null
          rubric_feasibility_score: number | null
          notes: string | null
          timeline_public: boolean
          vote_opens_at: string | null
          vote_closes_at: string | null
          submitted_at: string | null
          decided_at: string | null
          funded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lab_id: string
          co_lab_id?: string | null
          created_by_user_id: string
          name: string
          one_liner?: string | null
          problem?: string | null
          solution?: string | null
          traction?: string | null
          team?: string | null
          ask?: string | null
          status?: Database['public']['Enums']['candidate_status']
          status_reason?: string | null
          visibility?: Database['public']['Enums']['candidate_visibility']
          region_gated?: boolean
          rubric_team_score?: number | null
          rubric_traction_score?: number | null
          rubric_feasibility_score?: number | null
          notes?: string | null
          timeline_public?: boolean
          vote_opens_at?: string | null
          vote_closes_at?: string | null
          submitted_at?: string | null
          decided_at?: string | null
          funded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lab_id?: string
          co_lab_id?: string | null
          created_by_user_id?: string
          name?: string
          one_liner?: string | null
          problem?: string | null
          solution?: string | null
          traction?: string | null
          team?: string | null
          ask?: string | null
          status?: Database['public']['Enums']['candidate_status']
          status_reason?: string | null
          visibility?: Database['public']['Enums']['candidate_visibility']
          region_gated?: boolean
          rubric_team_score?: number | null
          rubric_traction_score?: number | null
          rubric_feasibility_score?: number | null
          notes?: string | null
          timeline_public?: boolean
          vote_opens_at?: string | null
          vote_closes_at?: string | null
          submitted_at?: string | null
          decided_at?: string | null
          funded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      verifications: {
        Row: {
          id: string
          user_id: string
          listing_id: string | null
          type: Database['public']['Enums']['verification_type']
          status: Database['public']['Enums']['verification_request_status']
          scheduled_at: string | null
          verifier_user_id: string | null
          consent_given: boolean
          consent_recorded_at: string | null
          recording_url: string | null
          recording_expires_at: string | null
          decision_notes: string | null
          decided_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          listing_id?: string | null
          type: Database['public']['Enums']['verification_type']
          status?: Database['public']['Enums']['verification_request_status']
          scheduled_at?: string | null
          verifier_user_id?: string | null
          consent_given?: boolean
          consent_recorded_at?: string | null
          recording_url?: string | null
          recording_expires_at?: string | null
          decision_notes?: string | null
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          listing_id?: string | null
          type?: Database['public']['Enums']['verification_type']
          status?: Database['public']['Enums']['verification_request_status']
          scheduled_at?: string | null
          verifier_user_id?: string | null
          consent_given?: boolean
          consent_recorded_at?: string | null
          recording_url?: string | null
          recording_expires_at?: string | null
          decision_notes?: string | null
          decided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      vouches: {
        Row: {
          id: string
          voucher_user_id: string
          vouchee_user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          voucher_user_id: string
          vouchee_user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          voucher_user_id?: string
          vouchee_user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          id: string
          email: string | null
          phone: string | null
          status: Database['public']['Enums']['waitlist_status']
          invite_id: string | null
          invited_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email?: string | null
          phone?: string | null
          status?: Database['public']['Enums']['waitlist_status']
          invite_id?: string | null
          invited_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          phone?: string | null
          status?: Database['public']['Enums']['waitlist_status']
          invite_id?: string | null
          invited_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      webhook_endpoints: {
        Row: {
          id: string
          owner_user_id: string
          api_key_id: string | null
          url: string
          secret: string
          event_types: string[]
          is_active: boolean
          last_delivery_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_user_id: string
          api_key_id?: string | null
          url: string
          secret: string
          event_types?: string[]
          is_active?: boolean
          last_delivery_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_user_id?: string
          api_key_id?: string | null
          url?: string
          secret?: string
          event_types?: string[]
          is_active?: boolean
          last_delivery_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database['public']['Enums']['user_role']
      }
      get_signup_mode: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      has_capability: {
        Args: { cap: Database['public']['Enums']['membership_capability'] }
        Returns: boolean
      }
      has_password: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_mod: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      list_visible_tiers: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; name: string; monthly_price_usd: number; position: number; capabilities: Database['public']['Enums']['membership_capability'][] }[]
      }
      normalize_auth_phone: {
        Args: { p: string }
        Returns: string
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "deactivated" | "pending_deletion" | "deleted"
      appeal_status: "pending" | "upheld" | "overturned"
      ask_status: "open" | "answered" | "closed"
      award_category: "best_lab" | "best_win" | "most_helpful" | "rising_builder"
      candidate_status: "draft" | "submitted" | "in_review" | "approved" | "parked" | "declined"
      candidate_visibility: "all_members" | "reviewers_only"
      claim_status: "pending" | "approved" | "rejected"
      consent_type: "terms_of_service" | "privacy_policy" | "cookies" | "analytics"
      content_source: "member" | "seed" | "ai"
      content_status: "published" | "hidden" | "removed"
      conversation_status: "pending" | "accepted" | "declined" | "blocked"
      entity_type: "user" | "profile" | "post" | "comment" | "tag" | "lab" | "lab_update" | "lab_artifact" | "lab_decision" | "candidate" | "listing" | "conversation" | "message" | "badge" | "vouch" | "report" | "invite" | "verification" | "interest" | "api_key" | "governance_entry" | "appeal" | "mod_action" | "listing_claim" | "waitlist_entry" | "lab_event" | "award_vote" | "push_subscription" | "webhook_endpoint" | "membership_tier" | "consent_record" | "capital_gate_evaluation"
      follow_target_type: "user" | "lab" | "candidate" | "tag"
      interest_type: "help" | "cosign" | "invest"
      lab_collaboration_status: "proposed" | "accepted" | "declined" | "ended"
      lab_join_mode: "open" | "request" | "invite"
      lab_member_role: "lead" | "core" | "member" | "observer"
      lab_member_specialization: "operator" | "researcher" | "advisor"
      lab_member_status: "invited" | "requested" | "active" | "declined" | "removed" | "left"
      lab_stage: "idea" | "building" | "validating" | "launched"
      lab_visibility: "private" | "members" | "public"
      language_code: "en" | "so"
      listing_verification_status: "unverified" | "pending" | "verified"
      membership_capability: "create_lab" | "join_unlimited_labs" | "vote_candidate" | "governance_rights" | "builder_path" | "investor_path" | "intelligence_updates"
      mod_action_type: "remove_content" | "restore_content" | "hide_content" | "warn_user" | "suspend_user" | "unsuspend_user" | "remove_listing" | "restore_listing" | "verify_user" | "revoke_verification" | "dismiss_report" | "other"
      poll_status: "open" | "closed"
      post_type: "intro" | "ask" | "win" | "update" | "poll"
      profile_verification_status: "unverified" | "pending" | "community_verified" | "identity_verified"
      reaction_type: "fire" | "strong" | "mashallah" | "idea" | "watching"
      report_reason: "spam" | "harassment" | "impersonation" | "fraud_or_scam" | "inappropriate_content" | "misinformation" | "other"
      report_status: "open" | "in_review" | "resolved" | "dismissed"
      space_mode: "club" | "lab"
      user_role: "member" | "mod" | "admin"
      verification_request_status: "pending" | "scheduled" | "approved" | "rejected" | "cancelled"
      verification_type: "identity" | "business"
      vote_choice: "approve" | "reject"
      waitlist_status: "pending" | "invited" | "joined"
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
