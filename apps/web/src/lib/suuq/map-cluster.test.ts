import { describe, expect, it } from 'vitest';

import { CLUSTER_CELL_PX, cellSizeDegrees, clusterPoints } from './map-cluster';

const p = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude });

describe('cellSizeDegrees', () => {
  it('halves with every zoom level', () => {
    expect(cellSizeDegrees(11)).toBeCloseTo(cellSizeDegrees(10) / 2, 10);
  });

  it('matches the web-mercator formula at zoom 0', () => {
    expect(cellSizeDegrees(0)).toBeCloseTo((360 / 256) * CLUSTER_CELL_PX, 10);
  });
});

describe('clusterPoints', () => {
  it('returns nothing for no points', () => {
    expect(clusterPoints([], 12)).toEqual([]);
  });

  it('groups nearby points at a low zoom', () => {
    // ~2km apart around Mogadishu — one cell when the whole country fits on
    // screen (zoom 6: cell ≈ 1.4°).
    const points = [p('a', 2.0469, 45.3182), p('b', 2.06, 45.33), p('c', 2.03, 45.3)];
    const clusters = clusterPoints(points, 6);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.items.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('separates the same points at a high zoom', () => {
    const points = [p('a', 2.0469, 45.3182), p('b', 2.06, 45.33), p('c', 2.03, 45.3)];
    const clusters = clusterPoints(points, 16);
    expect(clusters).toHaveLength(3);
    for (const cluster of clusters) expect(cluster.items).toHaveLength(1);
  });

  it('keeps distant cities apart even at a low zoom', () => {
    // Mogadishu vs Hargeisa (~9.5° / ~850km apart) at zoom 6 (cell ≈ 1.4°).
    const clusters = clusterPoints([p('mog', 2.0469, 45.3182), p('har', 9.56, 44.06)], 6);
    expect(clusters).toHaveLength(2);
  });

  it('places each point in exactly one cluster', () => {
    const points = Array.from({ length: 50 }, (_, i) =>
      p(`p${i}`, 2 + (i % 7) * 0.01, 45.3 + Math.floor(i / 7) * 0.01),
    );
    for (const zoom of [4, 9, 13, 17]) {
      const ids = clusterPoints(points, zoom)
        .flatMap((cluster) => cluster.items.map((item) => item.id))
        .sort();
      expect(ids).toEqual(points.map((point) => point.id).sort());
    }
  });

  it('positions a cluster at the mean of its members', () => {
    const clusters = clusterPoints([p('a', 2.0, 45.0), p('b', 2.2, 45.2)], 6);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.latitude).toBeCloseTo(2.1, 10);
    expect(clusters[0]!.longitude).toBeCloseTo(45.1, 10);
  });
});
