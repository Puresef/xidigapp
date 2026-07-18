// createServerClient (SERVICE-ROLE client, secret key) is intentionally NOT
// re-exported from this root barrel. Import it from '@xidig/db/server' so a
// value import of the secret-key factory is never indistinguishable, at the
// import site, from a browser-safe root import — a client-reachable
// `import { createServerClient } from '@xidig/db'` cannot compile.
// (Seq 49.5 service-role containment hardening.)
export { createBrowserClient } from './browser';
export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from './database.types';
