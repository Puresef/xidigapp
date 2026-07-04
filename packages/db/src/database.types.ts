// AUTO-GENERATED PLACEHOLDER.
//
// Replace by running `pnpm db:gen-types` once a Supabase project exists:
//   SUPABASE_PROJECT_ID=<ref> pnpm db:gen-types
//
// Keeping a typed placeholder here lets the workspace typecheck and build on a
// fresh clone before any project is provisioned.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
