
import { MapFeature, LatLng } from './types';

// Main function to find the shortest path
export function findPath(
  roads: MapFeature[],
  start: LatLng,
  end: LatLng
): LatLng[] | null {
  const graph = buildGraph(roads);

  const startInfo = findNearestPoint(start, roads);
  const endInfo = findNearestPoint(end, roads);

  if (!startInfo || !endInfo) return null;

  const startPoint = startInfo.point;
  const endPoint = endInfo.point;

  function stringToLatLng(str: string): LatLng {
    const [lat, lng] = str.split(',').map(Number);
    return { lat, lng };
  }

  if (!graph.has(startPoint)) {
    graph.set(startPoint, new Map());
    const [segA, segB] = startInfo.segment;
    const distA = calculateDistance(stringToLatLng(startPoint), stringToLatLng(segA));
    const distB = calculateDistance(stringToLatLng(startPoint), stringToLatLng(segB));
    graph.get(startPoint)!.set(segA, distA);
    graph.get(startPoint)!.set(segB, distB);
    if (!graph.has(segA)) graph.set(segA, new Map());
    if (!graph.has(segB)) graph.set(segB, new Map());
    graph.get(segA)!.set(startPoint, distA);
    graph.get(segB)!.set(startPoint, distB);
  }

  if (!graph.has(endPoint)) {
    graph.set(endPoint, new Map());
    const [segA, segB] = endInfo.segment;
    const distA = calculateDistance(stringToLatLng(endPoint), stringToLatLng(segA));
    const distB = calculateDistance(stringToLatLng(endPoint), stringToLatLng(segB));
    graph.get(endPoint)!.set(segA, distA);
    graph.get(endPoint)!.set(segB, distB);
    graph.get(segA)!.set(endPoint, distA);
    graph.get(segB)!.set(endPoint, distB);
  }

  const path = dijkstra(graph, startPoint, endPoint);

  return path;
}

function buildGraph(roads: MapFeature[]): Map<string, Map<string, number>> {
  const graph = new Map<string, Map<string, number>>();

  roads.forEach(road => {
    if (road.type === 'road' && road.path && !road.properties.isBlocked) {
      for (let i = 0; i < road.path.length - 1; i++) {
        const pointA = `${road.path[i].lat},${road.path[i].lng}`;
        const pointB = `${road.path[i + 1].lat},${road.path[i + 1].lng}`;
        const distance = calculateDistance(road.path[i], road.path[i + 1]);

        if (!graph.has(pointA)) graph.set(pointA, new Map());
        if (!graph.has(pointB)) graph.set(pointB, new Map());

        graph.get(pointA)!.set(pointB, distance);
        graph.get(pointB)!.set(pointA, distance); // Assuming bidirectional roads
      }
    }
  });

  // Intersection handling
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
    if (road.type !== 'road' || !road.path || road.properties.isBlocked) continue;

    for (let j = i + 1; j < roads.length; j++) { // Start from i + 1 to avoid duplicate checks
      const otherRoad = roads[j];
      if (otherRoad.type !== 'road' || !otherRoad.path || otherRoad.properties.isBlocked) continue;

      for (let k = 0; k < road.path.length - 1; k++) {
        const segA = road.path[k]; // These are LatLng objects
        const segB = road.path[k + 1];

        for (let m = 0; m < otherRoad.path.length - 1; m++) {
          const otherSegA = otherRoad.path[m];
          const otherSegB = otherRoad.path[m + 1];

          const intersection = findIntersection(segA, segB, otherSegA, otherSegB);
          if (intersection) {
            const intersectionStr = `${intersection.lat},${intersection.lng}`;

            // Add intersection point to graph if not already present
            if (!graph.has(intersectionStr)) graph.set(intersectionStr, new Map());

            // --- IMPORTANT: Splitting existing segments with the intersection point ---
            // If the intersection point is new, it means an existing segment needs to be split.
            // For segment (segA, segB):
            const segAStr = `${segA.lat},${segA.lng}`;
            const segBStr = `${segB.lat},${segB.lng}`;

            // Remove existing edge between segA and segB (if it exists)
            if (graph.get(segAStr)?.has(segBStr)) {
                graph.get(segAStr)!.delete(segBStr);
            }
            if (graph.get(segBStr)?.has(segAStr)) {
                graph.get(segBStr)!.delete(segAStr);
            }

            // Add new edges: segA <-> intersectionStr and intersectionStr <-> segB
            const distSegA_Int = calculateDistance(segA, intersection);
            const distInt_SegB = calculateDistance(intersection, segB);

            if (!graph.has(segAStr)) graph.set(segAStr, new Map());
            if (!graph.has(segBStr)) graph.set(segBStr, new Map());

            graph.get(segAStr)!.set(intersectionStr, distSegA_Int);
            graph.get(intersectionStr)!.set(segAStr, distSegA_Int);

            graph.get(intersectionStr)!.set(segBStr, distInt_SegB);
            graph.get(segBStr)!.set(intersectionStr, distInt_SegB);


            // Do the same for the other road segment (otherSegA, otherSegB)
            const otherSegAStr = `${otherSegA.lat},${otherSegA.lng}`;
            const otherSegBStr = `${otherSegB.lat},${otherSegB.lng}`;

            if (graph.get(otherSegAStr)?.has(otherSegBStr)) {
                graph.get(otherSegAStr)!.delete(otherSegBStr);
            }
            if (graph.get(otherSegBStr)?.has(otherSegAStr)) {
                graph.get(otherSegBStr)!.delete(otherSegAStr);
            }

            const distOtherSegA_Int = calculateDistance(otherSegA, intersection);
            const distInt_OtherSegB = calculateDistance(intersection, otherSegB);

            if (!graph.has(otherSegAStr)) graph.set(otherSegAStr, new Map());
            if (!graph.has(otherSegBStr)) graph.set(otherSegBStr, new Map());

            graph.get(otherSegAStr)!.set(intersectionStr, distOtherSegA_Int);
            graph.get(intersectionStr)!.set(otherSegAStr, distOtherSegA_Int);

            graph.get(intersectionStr)!.set(otherSegBStr, distInt_OtherSegB);
            graph.get(otherSegBStr)!.set(intersectionStr, distInt_OtherSegB);
          }
        }
      }
    }
  }

  return graph;
}

function findIntersection(A: LatLng, B: LatLng, C: LatLng, D: LatLng): LatLng | null {
  const denominator = (A.lat - B.lat) * (C.lng - D.lng) - (A.lng - B.lng) * (C.lat - D.lat);
  if (Math.abs(denominator) < 1e-10) return null;

  const numerator1 = (A.lng - C.lng) * (C.lat - D.lat) - (A.lat - C.lat) * (C.lng - D.lng);
  const numerator2 = (A.lng - C.lng) * (A.lat - B.lat) - (A.lat - C.lat) * (A.lng - B.lng);

  const r1 = numerator1 / denominator;
  const r2 = numerator2 / denominator;

  if (r1 >= 0 && r1 <= 1 && r2 >= 0 && r2 <= 1) {
    const lat = A.lat + r1 * (B.lat - A.lat);
    const lng = A.lng + r1 * (B.lng - A.lng);
    return { lat, lng };
  }

  return null;
}

function findNearestPoint(target: LatLng, roads: MapFeature[]): { point: string, segment: [string, string] } | null {
  let minDistance = Infinity;
  let nearest: { point: string, segment: [string, string] } | null = null;

  roads.forEach(road => {
    if (road.type === 'road' && road.path && !road.properties.isBlocked) {
      for (let i = 0; i < road.path.length - 1; i++) {
        const pointA = road.path[i];
        const pointB = road.path[i + 1];
        const projectedPoint = projectPointOnLineSegment(pointA, pointB, target);
        const distance = calculateDistance(target, projectedPoint);
        if (distance < minDistance) {
          minDistance = distance;
          const pointStr = `${projectedPoint.lat},${projectedPoint.lng}`;
          const segment = [`${pointA.lat},${pointA.lng}`, `${pointB.lat},${pointB.lng}`];
          nearest = { point: pointStr, segment };
        }
      }
    }
  });

  return nearest;
}

function projectPointOnLineSegment(A: LatLng, B: LatLng, C: LatLng): LatLng {
  const ABx = B.lat - A.lat;
  const ABy = B.lng - A.lng;
  const ACx = C.lat - A.lat;
  const ACy = C.lng - A.lng;
  const AB_AB = ABx * ABx + ABy * ABy;
  const AB_AC = ABx * ACx + ABy * ACy;
  const t = AB_AB === 0 ? 0 : Math.max(0, Math.min(1, AB_AC / AB_AB));

  return {
    lat: A.lat + t * ABx,
    lng: A.lng + t * ABy
  };
}

function calculateDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371e3;
  const φ1 = (point1.lat * Math.PI) / 180;
  const φ2 = (point2.lat * Math.PI) / 180;
  const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
  const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function dijkstra(
  graph: Map<string, Map<string, number>>,
  start: string,
  end: string
): LatLng[] | null {
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set<string>();

  graph.forEach((_, vertex) => {
    distances.set(vertex, Infinity);
    unvisited.add(vertex);
  });
  distances.set(start, 0);

  while (unvisited.size > 0) {
    let minDistance = Infinity;
    let current: string | null = null;

    for (const vertex of unvisited) {
      if (distances.get(vertex)! < minDistance) {
        minDistance = distances.get(vertex)!;
        current = vertex;
      }
    }

    if (current === null) break;
    if (current === end) break;

    unvisited.delete(current);

    const neighbors = graph.get(current);
    if (neighbors) {
      for (const [neighbor, distance] of neighbors) {
        if (unvisited.has(neighbor)) {
          const alt = distances.get(current)! + distance;
          if (alt < distances.get(neighbor)!) {
            distances.set(neighbor, alt);
            previous.set(neighbor, current);
          }
        }
      }
    }
  }

  const path: LatLng[] = [];
  let current: string | undefined = end;

  while (current && current !== start) {
    const [lat, lng] = current.split(',').map(Number);
    path.unshift({ lat, lng });
    current = previous.get(current);
  }

  if (!current) return null;

  const [lat, lng] = start.split(',').map(Number);
  path.unshift({ lat, lng });
  
  return path;
}