import { describe, expect, it } from 'vitest';

import { emptyBusinessesKey, emptyPeopleKey } from './directory-empty';

/**
 * Teaching / no-results empty-state selection (MEDIUM 4/5). The directories
 * split their single "no results" branch into initial-browse (teaching CTA),
 * empty-search (a free-text `q` was applied), and empty-filters (only
 * structured filters narrowed it to nothing).
 */

describe('emptyPeopleKey', () => {
  it('shows the teaching CTA on an unfiltered initial list', () => {
    expect(emptyPeopleKey('')).toBe('suuq.emptyPeople');
  });

  it('shows the empty-search copy when a free-text query was applied', () => {
    expect(emptyPeopleKey('q=maxamed')).toBe('suuq.emptyPeopleQuery');
    // q alongside filters still counts as a search.
    expect(emptyPeopleKey('q=hodan&verification=verified')).toBe('suuq.emptyPeopleQuery');
  });

  it('shows the empty-filters copy when only structured filters were applied', () => {
    expect(emptyPeopleKey('verification=verified')).toBe('suuq.emptyPeopleFilters');
    expect(emptyPeopleKey('skill=welding&lane=trades')).toBe('suuq.emptyPeopleFilters');
    expect(emptyPeopleKey('country=Somalia')).toBe('suuq.emptyPeopleFilters');
  });
});

describe('emptyBusinessesKey', () => {
  it('shows the teaching CTA on an unfiltered initial list', () => {
    expect(emptyBusinessesKey('', false)).toBe('suuq.emptyBusinesses');
  });

  it('shows the empty-search copy when a free-text query was applied', () => {
    expect(emptyBusinessesKey('q=cafe', false)).toBe('suuq.emptyBusinessesQuery');
    expect(emptyBusinessesKey('q=cafe&category=00000000-0000-0000-0000-000000000000', false)).toBe(
      'suuq.emptyBusinessesQuery',
    );
  });

  it('shows the empty-filters copy for structured server filters', () => {
    expect(emptyBusinessesKey('city=Muqdisho', false)).toBe('suuq.emptyBusinessesFilters');
  });

  it('treats a client-side open-now filter over a populated page as a filter miss', () => {
    // No server filter applied, but open-now emptied the loaded rows.
    expect(emptyBusinessesKey('', true)).toBe('suuq.emptyBusinessesFilters');
  });

  it('reports open-now as a filter miss even when a search query is also active', () => {
    // The query DID return rows; the open-now toggle hid them. The member
    // should be told to clear the toggle, not to change their search words.
    expect(emptyBusinessesKey('q=cafe', true)).toBe('suuq.emptyBusinessesFilters');
    expect(emptyBusinessesKey('q=cafe&city=Muqdisho', true)).toBe('suuq.emptyBusinessesFilters');
  });
});
