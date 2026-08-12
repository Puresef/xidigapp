import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ANIGA_MODULE_DEFAULTS } from '@/lib/aniga/modules';

/**
 * Resolve the platform flags that govern Aniga modules (ruling 7).
 *
 * `feature_flags` has RLS on with zero policies — nobody reads the roster, not
 * even the service role path, because a roster invites "just check the table"
 * shortcuts that drift from the trigger. The only reader is
 * `is_feature_enabled()`, which answers one boolean at a time, so this asks it
 * once per DISTINCT flag rather than once per module.
 *
 * A flag that errors or is missing resolves to FALSE: an unknown platform
 * decision locks the module. Failing open here would mean a transient database
 * blip could publish a module the platform has switched off.
 */
export async function loadModuleFlags(
  client: SupabaseClient<Database>,
): Promise<Record<string, boolean>> {
  const keys: string[] = [
    ...new Set(
      ANIGA_MODULE_DEFAULTS.flatMap((kind) =>
        kind.requiresFlag === null ? [] : [kind.requiresFlag],
      ),
    ),
  ];
  if (keys.length === 0) return {};

  const answers = await Promise.all(
    keys.map(async (key) => {
      const { data, error } = await client.rpc('is_feature_enabled', { p_key: key });
      return [key, !error && data === true] as const;
    }),
  );
  return Object.fromEntries(answers);
}
