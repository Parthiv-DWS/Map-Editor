export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapFeature {
  id: string; // Assuming roads have IDs
  type: string;
  path: LatLng[] | null;
  properties: {
    isBlocked: boolean;
    [key: string]: any;
  };
}

// --- Utility Functions (mostly from your existing code) ---
function stringToLatLng(str: string): LatLng {
  const [lat, lng] = str.split(',').map(Number);
  return { lat, lng };
}

function latLngToString(point: LatLng): string {
  return `${point.lat.toFixed(8)},${point.lng.toFixed(8)}`; // Increased precision slightly for keys
}

function arePointsEqual(p1: LatLng, p2: LatLng, tolerance: number = 1e-7): boolean { // Adjusted tolerance
  return Math.abs(p1.lat - p2.lat) < tolerance && Math.abs(p1.lng - p2.lng) < tolerance;
}

function calculateDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371e3; // Earth radius in meters
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

function projectPointOnLineSegment(A: LatLng, B: LatLng, C: LatLng): LatLng {
  const ABx = B.lat - A.lat;
  const ABy = B.lng - A.lng;
  const ACx = C.lat - A.lat;
  const ACy = C.lng - A.lng;
  
  const dotAB_AB = ABx * ABx + ABy * ABy;
  if (dotAB_AB === 0) return A; // A and B are the same point

  const dotAB_AC = ABx * ACx + ABy * ACy;
  let t = dotAB_AC / dotAB_AB;
  t = Math.max(0, Math.min(1, t)); // Clamp t to [0, 1] for segment projection

  return {
    lat: A.lat + t * ABx,
    lng: A.lng + t * ABy,
  };
}

function findIntersection(A: LatLng, B: LatLng, C: LatLng, D: LatLng): LatLng | null {
  // Line AB represented as A + r(B - A)
  // Line CD represented as C + s(D - C)
  // We need to solve for r and s.
  const p0_x = A.lng; const p0_y = A.lat;
  const p1_x = B.lng; const p1_y = B.lat;
  const p2_x = C.lng; const p2_y = C.lat;
  const p3_x = D.lng; const p3_y = D.lat;

  const s1_x = p1_x - p0_x;
  const s1_y = p1_y - p0_y;
  const s2_x = p3_x - p2_x;
  const s2_y = p3_y - p2_y;

  const denominator = (-s2_x * s1_y + s1_x * s2_y);
  if (Math.abs(denominator) < 1e-9) { // Lines are parallel or collinear
      return null; 
  }

  const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denominator;
  const t = ( s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denominator;

  const epsilon = 1e-5; // Tolerance for checking if intersection is on segment

  if (s >= -epsilon && s <= 1 + epsilon && t >= -epsilon && t <= 1 + epsilon) {
    // Collision detected
    return {
      lat: p0_y + (t * s1_y),
      lng: p0_x + (t * s1_x),
    };
  }
  return null; // No collision
}


function snapToVertex(point: LatLng, vertices: LatLng[], tolerance: number = 1e-7): LatLng {
  for (const vertex of vertices) {
    if (arePointsEqual(point, vertex, tolerance)) {
      return vertex; // Return the actual vertex object to maintain reference if needed (though string keys dominate)
    }
  }
  return point;
}

// --- Graph Building Logic (buildGraph) ---
function buildGraph(roads: MapFeature[]): Map<string, Map<string, number>> {
  const graph = new Map<string, Map<string, number>>();
  const allVerticesInvolvedInIntersections = new Set<string>();


  // Step 1: Add original road segments to graph
  const processedRoads: { road: MapFeature, path: LatLng[], isLoop: boolean }[] = [];
  roads.forEach(road => {
    if (road.type !== 'road' || !road.path || road.path.length < 2 || road.properties.isBlocked) {
      return;
    }
    const uniquePath: LatLng[] = [];
    if (road.path.length > 0) {
        uniquePath.push(road.path[0]);
        for (let i = 1; i < road.path.length; i++) {
            if (!arePointsEqual(road.path[i], road.path[i-1])) {
                uniquePath.push(road.path[i]);
            }
        }
    }
    if (uniquePath.length < 2) return;

    let isLoop = uniquePath.length > 2 && arePointsEqual(uniquePath[0], uniquePath[uniquePath.length - 1]);
    if (isLoop) {
      uniquePath.pop(); // Remove duplicate end point for loops
    }
    processedRoads.push({ road, path: uniquePath, isLoop });

    for (let i = 0; i < uniquePath.length; i++) {
      const p1 = uniquePath[i];
      const p2 = uniquePath[(i + 1) % uniquePath.length]; // Handles loops correctly

      if (i === uniquePath.length - 1 && !isLoop) continue; // Don't connect last to first for non-loops

      const p1Str = latLngToString(p1);
      const p2Str = latLngToString(p2);

      if (!graph.has(p1Str)) graph.set(p1Str, new Map());
      if (!graph.has(p2Str)) graph.set(p2Str, new Map());

      const dist = calculateDistance(p1, p2);
      graph.get(p1Str)!.set(p2Str, dist);
      graph.get(p2Str)!.set(p1Str, dist);
    }
  });

  // Step 2: Find intersections and update graph
  const intersectionPointsToAdd: { point: LatLng, segments: [[LatLng, LatLng], [LatLng, LatLng]] }[] = [];

  for (let i = 0; i < processedRoads.length; i++) {
    const r1 = processedRoads[i];
    // Self-intersections
    for (let j = 0; j < r1.path.length; j++) {
      const seg1A = r1.path[j];
      const seg1B = r1.path[(j + 1) % r1.path.length];
      if (j === r1.path.length -1 && !r1.isLoop) continue;


      for (let k = j + 2; k < r1.path.length; k++) { // k starts at j+2 to avoid adjacent segments
        if (r1.isLoop && j === 0 && k === r1.path.length - 1) continue; // Avoid P0-P1 vs P(last)-P0

        const seg2A = r1.path[k];
        const seg2B = r1.path[(k + 1) % r1.path.length];
        if (k === r1.path.length -1 && !r1.isLoop) continue;


        const intersection = findIntersection(seg1A, seg1B, seg2A, seg2B);
        if (intersection) {
          const snappedInt = snapToVertex(intersection, r1.path);
          intersectionPointsToAdd.push({ point: snappedInt, segments: [[seg1A, seg1B], [seg2A, seg2B]] });
        }
      }
    }

    // Intersections with other roads
    for (let l = i + 1; l < processedRoads.length; l++) {
      const r2 = processedRoads[l];
      for (let j = 0; j < r1.path.length; j++) {
        const seg1A = r1.path[j];
        const seg1B = r1.path[(j + 1) % r1.path.length];
        if (j === r1.path.length -1 && !r1.isLoop) continue;

        for (let k = 0; k < r2.path.length; k++) {
          const seg2A = r2.path[k];
          const seg2B = r2.path[(k + 1) % r2.path.length];
          if (k === r2.path.length -1 && !r2.isLoop) continue;

          const intersection = findIntersection(seg1A, seg1B, seg2A, seg2B);
          if (intersection) {
            const snappedInt = snapToVertex(intersection, [...r1.path, ...r2.path]);
            intersectionPointsToAdd.push({ point: snappedInt, segments: [[seg1A, seg1B], [seg2A, seg2B]] });
          }
        }
      }
    }
  }
  
  // Step 3: Process collected intersections to split segments in the graph
  intersectionPointsToAdd.forEach(({ point: intersectionPoint, segments }) => {
    const intStr = latLngToString(intersectionPoint);
    if (!graph.has(intStr)) {
        graph.set(intStr, new Map());
    }

    segments.forEach(([segA, segB]) => {
        const segAStr = latLngToString(segA);
        const segBStr = latLngToString(segB);

        // Only process if the original segment A-B exists and intersection is not one of its endpoints
        if (!arePointsEqual(intersectionPoint, segA) && !arePointsEqual(intersectionPoint, segB)) {
            // Remove original edge A-B
            if (graph.get(segAStr)?.has(segBStr)) {
                graph.get(segAStr)!.delete(segBStr);
                graph.get(segBStr)!.delete(segAStr);

                // Add edges A-Intersection and B-Intersection
                const distAInt = calculateDistance(segA, intersectionPoint);
                const distBInt = calculateDistance(segB, intersectionPoint);

                graph.get(segAStr)!.set(intStr, distAInt);
                graph.get(intStr)!.set(segAStr, distAInt);

                graph.get(segBStr)!.set(intStr, distBInt);
                graph.get(intStr)!.set(segBStr, distBInt);
            }
        }
        // Connect intersection point to segment endpoints (if intersection is one of the endpoints, this is fine)
        // This ensures connectivity even if snapToVertex made intersectionPoint = segA or segB
        // The previous block handles splitting. This block ensures the intersection node is connected.
        // This might add redundant connections if the intersection point is an existing vertex,
        // but Dijkstra will handle it.
        // A better way is that if intersectionPoint IS segA or segB, no new edges for *this* segment are needed for splitting.
        // The crucial part is connecting intStr to the *other* segment's endpoints.

        // Simplified: the loop structure will add intStr to endpoints of segment 1, then segment 2.
        // If intStr is an endpoint of seg1 (e.g. segA), then distAInt is 0.
        // Let's ensure intStr is connected to all 4 original segment endpoints (A, B, C, D)
        // IF it lies on their respective segments.
    });
     // The previous block correctly splits segment A-B by intStr into A-intStr and intStr-B.
     // This needs to be done for *both* segments involved in the intersection.
     // The `segments.forEach` loop does this for each segment of the pair.
  });


  return graph;
}


// --- Finding Nearest Point on Processed Graph ---
interface NearestPointInfo {
  point: LatLng;      // The coordinate of the nearest point
  pointStr: string;   // Stringified version of the point
  segmentNodes: [string, string]; // The two graph nodes defining the segment it's on
  onExistingNode: boolean; // True if 'point' is an existing graph node
}

function findNearestPointOnGraph(
  target: LatLng,
  graph: Map<string, Map<string, number>>
): NearestPointInfo | null {
  let minDistance = Infinity;
  let nearestResult: NearestPointInfo | null = null;
  const visitedSegments = new Set<string>();

  graph.forEach((edges, nodeA_str) => {
    const nodeA_latlng = stringToLatLng(nodeA_str);

    const distToNodeA = calculateDistance(target, nodeA_latlng);
    if (distToNodeA < minDistance) {
      minDistance = distToNodeA;
      nearestResult = {
        point: nodeA_latlng,
        pointStr: nodeA_str,
        segmentNodes: [nodeA_str, nodeA_str], // Indicates it's on a node
        onExistingNode: true,
      };
    }

    edges.forEach((_, nodeB_str) => {
      const segKey1 = `${nodeA_str}|${nodeB_str}`;
      const segKey2 = `${nodeB_str}|${nodeA_str}`;
      if (visitedSegments.has(segKey1) || visitedSegments.has(segKey2) || nodeA_str === nodeB_str) {
        return;
      }
      visitedSegments.add(segKey1);

      const nodeB_latlng = stringToLatLng(nodeB_str);
      const projectedPoint = projectPointOnLineSegment(nodeA_latlng, nodeB_latlng, target);
      const distToProjected = calculateDistance(target, projectedPoint);

      if (distToProjected < minDistance) {
        minDistance = distToProjected;
        let onNode = false;
        let finalPointStr = latLngToString(projectedPoint);
        let finalPoint = projectedPoint;

        if (arePointsEqual(projectedPoint, nodeA_latlng)) {
            onNode = true;
            finalPointStr = nodeA_str;
            finalPoint = nodeA_latlng;
        } else if (arePointsEqual(projectedPoint, nodeB_latlng)) {
            onNode = true;
            finalPointStr = nodeB_str;
            finalPoint = nodeB_latlng;
        }
        
        nearestResult = {
          point: finalPoint,
          pointStr: finalPointStr,
          segmentNodes: [nodeA_str, nodeB_str],
          onExistingNode: onNode,
        };
      }
    });
  });
  return nearestResult;
}

// --- Adding Projected Point to Graph ---
function addPointToGraph(
  graph: Map<string, Map<string, number>>,
  nearestInfo: NearestPointInfo
): string { // Returns the string key of the effective node for originalPoint in the graph
  
  if (nearestInfo.onExistingNode) {
    return nearestInfo.pointStr; // Use the existing node.
  }

  const projectedPointStr = nearestInfo.pointStr;
  const projectedPointLatLng = nearestInfo.point;

  // If projectedPointStr is already a node (e.g., two projections map to the same non-vertex point)
  // This check implies that if onExistingNode was false, but the string key somehow matches an existing node,
  // we treat it as if it were an existing node to avoid re-splitting.
  if (graph.has(projectedPointStr)) {
      return projectedPointStr;
  }
  
  graph.set(projectedPointStr, new Map());

  const [segNodeA_str, segNodeB_str] = nearestInfo.segmentNodes;
  // Ensure segNodeA_str and segNodeB_str are valid nodes from the graph
  if (!graph.has(segNodeA_str) || !graph.has(segNodeB_str)) {
      console.error("Segment nodes for projection not found in graph:", segNodeA_str, segNodeB_str);
      // Fallback: connect projection only to existing nodes, or handle error
      // For now, we assume graph integrity means they exist.
  }

  const segNodeA_latlng = stringToLatLng(segNodeA_str);
  const segNodeB_latlng = stringToLatLng(segNodeB_str);

  // Remove old edge segNodeA_str --- segNodeB_str from graph
  graph.get(segNodeA_str)?.delete(segNodeB_str);
  graph.get(segNodeB_str)?.delete(segNodeA_str);
  
  // Add new edges: segNodeA_str --- projectedPointStr --- segNodeB_str
  const distProjToSegA = calculateDistance(projectedPointLatLng, segNodeA_latlng);
  graph.get(projectedPointStr)!.set(segNodeA_str, distProjToSegA);
  graph.get(segNodeA_str)!.set(projectedPointStr, distProjToSegA);

  const distProjToSegB = calculateDistance(projectedPointLatLng, segNodeB_latlng);
  graph.get(projectedPointStr)!.set(segNodeB_str, distProjToSegB);
  graph.get(segNodeB_str)!.set(projectedPointStr, distProjToSegB);
  
  return projectedPointStr;
}

// --- Dijkstra's Algorithm ---
function dijkstra(
  graph: Map<string, Map<string, number>>,
  startNodeStr: string,
  endNodeStr: string
): LatLng[] | null {
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const pq = new Map<string, number>(); // Using a Map as a min-priority queue (simplified)

  graph.forEach((_, vertex) => {
    distances.set(vertex, Infinity);
  });

  distances.set(startNodeStr, 0);
  pq.set(startNodeStr, 0);

  while (pq.size > 0) {
    // Get vertex with smallest distance from pq
    let u: string | null = null;
    let minVal = Infinity;
    pq.forEach((dist, vertex) => {
      if (dist < minVal) {
        minVal = dist;
        u = vertex;
      }
    });

    if (u === null) break; // Should not happen if pq is not empty
    
    pq.delete(u);

    if (u === endNodeStr) break; // Reached destination

    const neighbors = graph.get(u);
    if (neighbors) {
      for (const [v_neighbor, weight] of neighbors) {
        const alt = distances.get(u)! + weight;
        if (alt < distances.get(v_neighbor)!) {
          distances.set(v_neighbor, alt);
          previous.set(v_neighbor, u);
          pq.set(v_neighbor, alt);
        }
      }
    }
  }

  if (distances.get(endNodeStr) === Infinity) {
    return null; // No path found
  }

  const path: LatLng[] = [];
  let currentPathNode: string | undefined = endNodeStr;
  while (currentPathNode) {
    path.unshift(stringToLatLng(currentPathNode));
    if (currentPathNode === startNodeStr) break;
    currentPathNode = previous.get(currentPathNode);
  }
  
  // Ensure path actually starts at startNodeStr if found
  if (path.length === 0 || !arePointsEqual(path[0], stringToLatLng(startNodeStr))) {
      if (startNodeStr === endNodeStr) return [stringToLatLng(startNodeStr)]; // Path to self
      // This might indicate an issue if a path was expected.
      // If previous.get(endNodeStr) is undefined but distances.get(endNodeStr) is not Infinity,
      // it means endNodeStr is startNodeStr itself.
      console.warn("Dijkstra path reconstruction issue or start=end.");
  }

  return path.length > 0 ? path : null;
}


// --- Main Pathfinding Function ---
export function findPath(
  roads: MapFeature[],
  start: LatLng,
  end: LatLng
): LatLng[] | null {
  console.log('findPath called with Start:', start, 'End:', end);

  if (arePointsEqual(start, end)) return [start];

  const baseGraph = buildGraph(roads);
  
  // Create a mutable copy for adding start/end projections
  const workingGraph = new Map<string, Map<string, number>>();
  baseGraph.forEach((edges, key) => workingGraph.set(key, new Map(edges)));

  const startInfo = findNearestPointOnGraph(start, workingGraph);
  if (!startInfo) {
    console.error("Could not find nearest point on graph for Start.");
    return null;
  }
  const effectiveStartNodeStr = addPointToGraph(workingGraph, startInfo);

  // Re-evaluate for end point on the graph that might now include the start projection
  const endInfo = findNearestPointOnGraph(end, workingGraph);
   if (!endInfo) {
    console.error("Could not find nearest point on graph for End.");
    return null;
  }
  const effectiveEndNodeStr = addPointToGraph(workingGraph, endInfo);
  
  console.log('Effective Start Node:', effectiveStartNodeStr, 'Effective End Node:', effectiveEndNodeStr);

  const dijkstraPath = dijkstra(workingGraph, effectiveStartNodeStr, effectiveEndNodeStr);

  // Assemble the final path
  const finalPath: LatLng[] = [];
  if (!dijkstraPath) {
    // Handle no path from Dijkstra: e.g. start/end project to same point
    if (effectiveStartNodeStr === effectiveEndNodeStr) {
        const commonNodeLatLng = stringToLatLng(effectiveStartNodeStr);
        finalPath.push(start);
        if (!arePointsEqual(start, commonNodeLatLng) && !arePointsEqual(end, commonNodeLatLng)) {
             finalPath.push(commonNodeLatLng);
        }
        if (finalPath.length === 0 || !arePointsEqual(end, finalPath[finalPath.length-1])) {
            finalPath.push(end);
        }
    } else {
        console.warn("Dijkstra couldn't find a path.");
        return null; // No path found
    }
  } else {
    // Path found by Dijkstra
    finalPath.push(start); // Start with the actual start coordinate
    
    dijkstraPath.forEach(p_latlng => {
        if (finalPath.length === 0 || !arePointsEqual(p_latlng, finalPath[finalPath.length - 1])) {
            finalPath.push(p_latlng);
        }
    });

    if (finalPath.length === 0 || !arePointsEqual(end, finalPath[finalPath.length - 1])) {
        finalPath.push(end); // End with the actual end coordinate
    }
  }
  
  // Deduplicate final path just in case (e.g., if start/end was one of the dijkstra points)
  if (finalPath.length < 1) return null; // Should not happen if start/end are valid
  const uniqueFinalPath: LatLng[] = [finalPath[0]];
  for (let i = 1; i < finalPath.length; i++) {
      if (!arePointsEqual(finalPath[i], uniqueFinalPath[uniqueFinalPath.length-1])) {
          uniqueFinalPath.push(finalPath[i]);
      }
  }
  
  console.log('Computed final path:', uniqueFinalPath);
  return uniqueFinalPath.length > 0 ? uniqueFinalPath : null;
}

// --- Helper to log graph for debugging ---
function graphToLoggable(graph: Map<string, Map<string, number>>): Record<string, Record<string, number>> {
    const loggable: Record<string, Record<string, number>> = {};
    graph.forEach((edges, node) => {
        const edgeObj: Record<string, number> = {};
        edges.forEach((distance, neighbor) => {
            edgeObj[neighbor] = distance;
        });
        loggable[node] = edgeObj;
    });
    return loggable;
}