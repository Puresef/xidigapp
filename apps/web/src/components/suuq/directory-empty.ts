import type { MessageKey } from '@xidig/i18n';

/**
 * Teaching / no-results empty-state key selection for the Suuq directories
 * (MEDIUM 4/5). Kept in a plain module (no React imports) so it stays unit-
 * testable in the node test env and shared by both directory tabs.
 *
 * `applied` is the URLSearchParams string that produced the current result
 * list. The branches:
 *   - empty (and no client filter) → initial browse → teaching CTA
 *   - a free-text `q` present       → the search came up empty
 *   - only structured filters       → filters narrowed it to nothing
 */

export function emptyPeopleKey(applied: string): MessageKey {
  if (!applied) return 'suuq.emptyPeople' as MessageKey;
  const params = new URLSearchParams(applied);
  if (params.has('q')) return 'suuq.emptyPeopleQuery' as MessageKey;
  return 'suuq.emptyPeopleFilters' as MessageKey;
}

/**
 * `clientFiltered` is true when the client-side open-now toggle emptied an
 * otherwise-populated page. The server query DID return rows, so it takes
 * precedence over the `q` branch: the correct nudge is to clear the open-now
 * toggle, not to change the search words. Only when open-now is NOT the cause
 * do we fall through to the search / structured-filter copy.
 */
export function emptyBusinessesKey(applied: string, clientFiltered: boolean): MessageKey {
  if (clientFiltered) return 'suuq.emptyBusinessesFilters' as MessageKey;
  if (!applied) return 'suuq.emptyBusinesses' as MessageKey;
  const params = new URLSearchParams(applied);
  if (params.has('q')) return 'suuq.emptyBusinessesQuery' as MessageKey;
  return 'suuq.emptyBusinessesFilters' as MessageKey;
}
