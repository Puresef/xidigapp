import { describe, expect, it } from 'vitest';

import {
  MAP_BBOX_STORAGE_KEY,
  formatBbox,
  loadStoredBbox,
  parseBbox,
  shouldPersistBbox,
  storeBbox,
  type BboxChangeReason,
} from './map-viewport';

/** Minimal in-memory Storage stand-in (vitest runs in node — no window). */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('parseBbox', () => {
  it('parses the west,south,east,north wire format', () => {
    expect(parseBbox('45.10,1.90,45.60,2.30')).toEqual([45.1, 1.9, 45.6, 2.3]);
  });

  it('round-trips through formatBbox', () => {
    const bbox = formatBbox([45.318199, 2.0469, 45.518199, 2.2469]);
    expect(parseBbox(bbox)).toEqual([45.318199, 2.0469, 45.518199, 2.2469]);
  });

  it('tolerates world-wrapped longitudes (Leaflet pans past ±180)', () => {
    expect(parseBbox('170,-10,190,10')).toEqual([170, -10, 190, 10]);
  });

  it.each([
    ['', 'empty'],
    ['1,2,3', 'wrong arity'],
    ['1,2,3,4,5', 'wrong arity (long)'],
    ['a,b,c,d', 'NaN parts'],
    ['45,91,46,92', 'latitude out of range'],
    ['45,2,44,3', 'inverted west/east'],
    ['45,3,46,2', 'inverted south/north'],
    ['600,-10,610,10', 'longitude beyond wrap tolerance'],
  ])('rejects "%s" (%s)', (raw) => {
    expect(parseBbox(raw)).toBeNull();
  });

  it('rejects null and undefined', () => {
    expect(parseBbox(null)).toBeNull();
    expect(parseBbox(undefined)).toBeNull();
  });
});

describe('loadStoredBbox / storeBbox', () => {
  it('stores under the namespaced key and loads it back', () => {
    const storage = fakeStorage();
    storeBbox('45.100000,1.900000,45.600000,2.300000', storage);
    expect(storage.data.get(MAP_BBOX_STORAGE_KEY)).toBe('45.100000,1.900000,45.600000,2.300000');
    expect(loadStoredBbox(storage)).toBe('45.100000,1.900000,45.600000,2.300000');
  });

  it('never stores an invalid bbox', () => {
    const storage = fakeStorage();
    storeBbox('garbage', storage);
    expect(storage.data.size).toBe(0);
  });

  it('treats a corrupted stored value as absent', () => {
    const storage = fakeStorage({ [MAP_BBOX_STORAGE_KEY]: 'not-a-bbox' });
    expect(loadStoredBbox(storage)).toBeNull();
  });

  it('survives storage that throws (private mode / quota)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadStoredBbox(throwing)).toBeNull();
    expect(() => storeBbox('45,1,46,2', throwing)).not.toThrow();
  });

  it('no-ops without a storage (SSR / storage disabled)', () => {
    expect(loadStoredBbox(null)).toBeNull();
    expect(() => storeBbox('45,1,46,2', null)).not.toThrow();
  });
});

describe('shouldPersistBbox', () => {
  it.each<BboxChangeReason>(['user', 'fit', 'restore'])(
    'persists real viewports (%s)',
    (reason) => {
      expect(shouldPersistBbox(reason)).toBe(true);
    },
  );

  it('never persists the hardcoded default viewport', () => {
    // Storing the Mogadishu fallback on an empty first visit would make the
    // stored bbox win every later mount — fit-to-pins would never run again.
    expect(shouldPersistBbox('default')).toBe(false);
  });
});
