/**
 * Dependency-free marker clustering for the Suuq browse map (Task 12, §18).
 *
 * Why not leaflet.markercluster: /api/listings caps a map fetch at 50 rows
 * (MAX_PAGE_SIZE), so the plugin's spiderfy/chunked-render machinery buys
 * nothing at this scale — a zoom-scaled grid pass over ≤50 points is O(n),
 * ships zero extra bytes, and keeps apps/web/package.json untouched (its
 * uncommitted diff belongs to another session).
 *
 * Method: bucket points into a square grid whose cell is ~CLUSTER_CELL_PX
 * wide at the current zoom (web-mercator: 360° of longitude spans 256·2^zoom
 * px), then emit one cluster per non-empty cell at the members' mean
 * position. Cells are sized in raw degrees — at the latitudes Suuq serves
 * (Somalia + diaspora, well under ±66°) the horizontal shrink just makes
 * clusters slightly tighter east-west, which reads fine.
 */

export interface ClusterablePoint {
  id: string;
  latitude: number;
  longitude: number;
}

export interface MapCluster<T extends ClusterablePoint> {
  /** Mean position of the members — where the badge (or lone pin) renders. */
  latitude: number;
  longitude: number;
  items: T[];
}

/** Target cell width in CSS pixels — two 28px badges never overlap-collide. */
export const CLUSTER_CELL_PX = 64;

/** Grid cell size in degrees for a web-mercator zoom level. */
export function cellSizeDegrees(zoom: number, cellPx: number = CLUSTER_CELL_PX): number {
  return (360 / (256 * 2 ** zoom)) * cellPx;
}

/**
 * Group points into grid clusters for the given zoom. Every input point lands
 * in exactly one cluster; singleton cells come back as 1-item clusters (the
 * caller renders those as plain pins).
 */
export function clusterPoints<T extends ClusterablePoint>(
  points: readonly T[],
  zoom: number,
  cellPx: number = CLUSTER_CELL_PX,
): Array<MapCluster<T>> {
  const cell = cellSizeDegrees(zoom, cellPx);
  const buckets = new Map<string, T[]>();
  for (const point of points) {
    const key = `${Math.floor(point.latitude / cell)}:${Math.floor(point.longitude / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }
  return [...buckets.values()].map((items) => ({
    latitude: items.reduce((sum, p) => sum + p.latitude, 0) / items.length,
    longitude: items.reduce((sum, p) => sum + p.longitude, 0) / items.length,
    items,
  }));
}
