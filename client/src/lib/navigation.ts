
import { MapFeature, LatLng } from './types';

export function findPath(
  roads: MapFeature[],
  start: LatLng,
  end: LatLng
): LatLng[] | null {
  // Convert roads to graph
  const graph = buildGraph(roads);
  
  // Find nearest points on roads to start and end
  const startPoint = findNearestPoint(start, roads);
  const endPoint = findNearestPoint(end, roads);
  
  if (!startPoint || !endPoint) return null;
  
  // Use Dijkstra's algorithm to find the shortest path
  const path = dijkstra(graph, startPoint, endPoint);
  
  return path;
}

function buildGraph(roads: MapFeature[]): Map<string, Map<string, number>> {
  const graph = new Map();
  
  roads.forEach(road => {
    if (road.type === 'road' && road.path && !road.properties.isBlocked) {
      for (let i = 0; i < road.path.length - 1; i++) {
        const pointA = `${road.path[i].lat},${road.path[i].lng}`;
        const pointB = `${road.path[i + 1].lat},${road.path[i + 1].lng}`;
        const distance = calculateDistance(road.path[i], road.path[i + 1]);
        
        if (!graph.has(pointA)) graph.set(pointA, new Map());
        if (!graph.has(pointB)) graph.set(pointB, new Map());
        
        graph.get(pointA).set(pointB, distance);
        graph.get(pointB).set(pointA, distance);
      }
            // Connect intersecting road segments
            roads.forEach(otherRoad => {
              if (otherRoad.type === 'road' && otherRoad.path && !otherRoad.properties.isBlocked) {
                road.path?.forEach((point, i) => {
                  otherRoad.path?.forEach((otherPoint, j) => {
                    if (calculateDistance(point, otherPoint) < 0.00001) { // Threshold for considering points connected
                      const pointStr = `${point.lat},${point.lng}`;
                      const otherStr = `${otherPoint.lat},${otherPoint.lng}`;
                      
                      if (!graph.has(pointStr)) graph.set(pointStr, new Map());
                      if (!graph.has(otherStr)) graph.set(otherStr, new Map());
      
                      graph.get(pointStr).set(otherStr, 0);
                      graph.get(otherStr).set(pointStr, 0);
                    }
                  });
                });
              }
            });
    }
  });
  
  return graph;
}

function findNearestPoint(point: LatLng, roads: MapFeature[]): string | null {
  let minDistance = Infinity;
  let nearestPoint = null;
  
  roads.forEach(road => {
    if (road.type === 'road' && road.path && !road.properties.isBlocked) {
      road.path.forEach(pathPoint => {
        const distance = calculateDistance(point, pathPoint);
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = `${pathPoint.lat},${pathPoint.lng}`;
        }
      });
    }
  });
  
  return nearestPoint;
}

function calculateDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}

function dijkstra(
  graph: Map<string, Map<string, number>>,
  start: string,
  end: string
): LatLng[] {
  const distances = new Map();
  const previous = new Map();
  const unvisited = new Set();
  
  // Initialize distances
  graph.forEach((_, vertex) => {
    distances.set(vertex, Infinity);
    unvisited.add(vertex);
  });
  distances.set(start, 0);
  
  while (unvisited.size > 0) {
    // Find vertex with minimum distance
    let minDistance = Infinity;
    let current: any = null;
    unvisited.forEach(vertex => {
      if (distances.get(vertex) < minDistance) {
        minDistance = distances.get(vertex);
        current = vertex;
      }
    });
    
    if (current === null || current === end) break;
    
    unvisited.delete(current);
    
    // Update distances to neighbors
    graph.get(current)?.forEach((distance, neighbor) => {
      if (unvisited.has(neighbor)) {
        const alt = distances.get(current) + distance;
        if (alt < distances.get(neighbor)) {
          distances.set(neighbor, alt);
          previous.set(neighbor, current);
        }
      }
    });
  }
  
  // Reconstruct path
  const path: LatLng[] = [];
  let current = end;
  
  while (current !== start) {
    const [lat, lng] = current.split(',').map(Number);
    path.unshift({ lat, lng });
    current = previous.get(current);
    if (!current) return null; // No path found
  }
  
  const [lat, lng] = start.split(',').map(Number);
  path.unshift({ lat, lng });
  
  return path;
}