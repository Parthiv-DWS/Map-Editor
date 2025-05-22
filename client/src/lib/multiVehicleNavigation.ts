// src/lib/multiVehicleNavigation.ts

// Import necessary types from your existing files
// Adjust the path './types' if your interfaces file is located elsewhere (e.g. './interfaces')
import { LatLng, MapFeature as FullMapFeature } from './types'; 

// Import utilities from your existing navigation file
// Adjust the path './navigation' as needed
import {
  calculateDistance,
  stringToLatLng,
  findNearestPointOnGraph as findNearestPointOnGraph_original, // Rename to avoid conflict if you redefine
  addPointToGraph as addPointToGraph_original,
  buildGraph,
  latLngToString,
  arePointsEqual, // If needed directly, otherwise A* will use node strings
  // We will also need buildGraph, findNearestPointOnGraph, addPointToGraph
  // from navigation.ts when we implement planAllVehicleRoutes
} from './navigation';

// Type assertion for the imported functions if their original file doesn't export precise MapFeature type
type OriginalMapFeature = import('./navigation').MapFeature;

// --- INTERFACES FOR MULTI-VEHICLE NAVIGATION ---

export interface VehicleRequest {
  id: string; // Unique identifier for the vehicle
  speed: number; // Speed in meters per second
  length: number; // Length of the trailer in meters
  startPosition: LatLng; // Original start coordinate
  endPosition: LatLng;   // Original end coordinate
  startTime: number; // Desired absolute simulation start time (seconds from t=0)
}

export interface VehicleInfoForPlanning extends VehicleRequest {
    effectiveStartNodeStr: string; // Snapped start node on the graph
    effectiveEndNodeStr: string;   // Snapped end node on the graph
}


export interface TimedNode {
  nodeStr: string; // Graph node identifier (stringified LatLng)
  latlng: LatLng;  // The LatLng of this node
  time: number;    // Absolute simulation time (in seconds) when the vehicle's FRONT reaches this node
}

export interface SegmentOccupation {
  vehicleId: string;
  // segmentKey: string; // Canonical key like "lat1,lng1|lat2,lng2" (nodeA_str|nodeB_str, sorted)
  nodeA_str: string;
  nodeB_str: string;
  startTime: number;  // Absolute simulation time vehicle front enters segment
  endTime: number;    // Absolute simulation time vehicle TAIL exits segment
}

export interface NodeOccupation {
  vehicleId: string;
  nodeStr: string;
  entryTime: number;  // Absolute simulation time vehicle enters the node's vicinity
  exitTime: number;   // Absolute simulation time vehicle exits the node's vicinity
}

export interface GlobalReservations {
  // Key: segmentKey (e.g., "nodeA_str|nodeB_str" sorted alphabetically)
  segmentOccupations: Map<string, SegmentOccupation[]>; 
  // Key: nodeStr
  nodeOccupations: Map<string, NodeOccupation[]>;
}

export interface VehiclePathPlan {
  vehicleId: string;
  path: TimedNode[]; // The sequence of timed nodes representing the route
  totalTimeSeconds?: number; // Optional: total travel duration for this vehicle
  status: 'SUCCESS' | 'FAILED_NO_PATH' | 'FAILED_CONSTRAINED';
}

// For the A* priority queue
export interface AStarQueueItem {
  nodeStr: string;           // Current node identifier
  gScore: number;            // Accumulated cost (time in seconds, including penalties) from start to this node
  fScore: number;            // gScore + heuristic estimate to goal
  currentTimeAtNode: number; // Absolute simulation time when the vehicle's FRONT arrives at this node
  parentStr?: string;        // The nodeStr of the node from which we reached this one (for path reconstruction)
}

// --- CONSTANTS ---
export const HUGE_PENALTY = 1e9; // Used for critical conflicts (e.g., head-on)
export const NODE_CONFLICT_PENALTY = 3600; // e.g., 1 hour penalty in seconds
export const SEGMENT_FOLLOW_TOO_CLOSE_PENALTY = 600; // e.g. 10 min penalty
export const SAFETY_TIME_WINDOW_NODE_SECONDS = 15; // Buffer time around node occupation
// How long a vehicle "occupies" a node just by passing through (trailer length isn't main factor here, but time to clear intersection)
export const NODE_CLEARANCE_TIME_SECONDS = 10; 
export const WAIT_PENALTY_PER_SECOND = 1; // Cost for each second of waiting (if explicit waiting is implemented)

// --- HEURISTIC FUNCTION for A* ---
/**
 * Estimates the time to travel from one node to another in a straight line.
 * @param nodeLatlng Current node's LatLng.
 * @param goalLatlng Goal node's LatLng.
 * @param vehicleSpeed Speed of the vehicle in meters per second.
 * @returns Estimated time in seconds.
 */
function heuristic(nodeLatlng: LatLng, goalLatlng: LatLng, vehicleSpeed: number): number {
    if (vehicleSpeed <= 0) return Infinity; // Avoid division by zero or negative speed
    const distance = calculateDistance(nodeLatlng, goalLatlng);
    return distance / vehicleSpeed;
  }



  // --- CONFLICT PENALTY CALCULATION ---
//   function calculateConflictPenalty(
//     u_str: string,                      // Current node in A*
//     v_str: string,                      // Neighbor node being considered
//     departureTimeFromU_abs: number,     // Absolute time current vehicle's FRONT leaves u_str
//     arrivalTimeAtV_abs: number,         // Absolute time current vehicle's FRONT arrives at v_str
//     currentVehicleId: string,
//     currentVehicleLength: number,
//     currentVehicleSpeed: number,
//     reservations: GlobalReservations
//   ): number {
//     let totalConflictPenalty = 0;
  
//     // --- 1. Segment Conflict Check ---
//     // The segment is occupied by the current vehicle from the moment its front enters u_str
//     // until its TAIL exits v_str.
//     const segmentKey_uv = u_str < v_str ? `${u_str}|${v_str}` : `${v_str}|${u_str}`; // Canonical key
  
//     // Time current vehicle's FRONT enters the segment (effectively departureTimeFromU_abs)
//     const currentVeh_Seg_FrontEnters_abs = departureTimeFromU_abs;
//     // Time current vehicle's TAIL exits the segment at v_str
//     const segmentDistance = calculateDistance(stringToLatLng(u_str), stringToLatLng(v_str));
//     const timeForTailToClearSegment = (segmentDistance + currentVehicleLength) / currentVehicleSpeed;
//     const currentVeh_Seg_TailExits_abs = departureTimeFromU_abs + timeForTailToClearSegment;
    
//     const existingSegmentReservations = reservations.segmentOccupations.get(segmentKey_uv);
//     if (existingSegmentReservations) {
//       for (const res of existingSegmentReservations) {
//         if (res.vehicleId === currentVehicleId) continue; // Don't conflict with self
  
//         // Check for time overlap: max(start1, start2) < min(end1, end2)
//         const overlapStartTime = Math.max(currentVeh_Seg_FrontEnters_abs, res.startTime);
//         const overlapEndTime = Math.min(currentVeh_Seg_TailExits_abs, res.endTime);
  
//         if (overlapStartTime < overlapEndTime) {
//           // There is a time overlap on this segment.
//           // Now, determine if it's a head-on or just "following too close" type of conflict.
//           // For simplicity now, any overlap on a segment is a major conflict.
//           // A more advanced check would see if res.nodeA_str === v_str (other vehicle coming from v to u).
//           // If roads are two-way, any overlap is potentially serious.
//           totalConflictPenalty += HUGE_PENALTY; 
//           // console.warn(`Conflict: Vehicle ${currentVehicleId} on ${u_str}->${v_str} [${currentVeh_Seg_FrontEnters_abs.toFixed(1)}-${currentVeh_Seg_TailExits_abs.toFixed(1)}] overlaps with ${res.vehicleId} [${res.startTime.toFixed(1)}-${res.endTime.toFixed(1)}]`);
//           break; // One major segment conflict is enough to heavily penalize this edge
//         }
//       }
//     }
  
//     // --- 2. Node Conflict Check (at destination node v_str of the current edge) ---
//     // Vehicle "occupies" node v_str from its arrival until it has cleared it.
//     // We use a safety window around its arrival time.
//     const currentVeh_NodeV_EnterVicinity_abs = arrivalTimeAtV_abs - (SAFETY_TIME_WINDOW_NODE_SECONDS / 2);
//     const currentVeh_NodeV_ExitVicinity_abs = arrivalTimeAtV_abs + NODE_CLEARANCE_TIME_SECONDS + (SAFETY_TIME_WINDOW_NODE_SECONDS / 2);
//     // NODE_CLEARANCE_TIME_SECONDS is how long it takes for the vehicle to pass through the node itself.
  
//     const existingNodeVReservations = reservations.nodeOccupations.get(v_str);
//     if (existingNodeVReservations) {
//       for (const res of existingNodeVReservations) {
//         if (res.vehicleId === currentVehicleId) continue;
  
//         const overlapStartTime = Math.max(currentVeh_NodeV_EnterVicinity_abs, res.entryTime);
//         const overlapEndTime = Math.min(currentVeh_NodeV_ExitVicinity_abs, res.exitTime);
  
//         if (overlapStartTime < overlapEndTime) {
//           totalConflictPenalty += NODE_CONFLICT_PENALTY;
//           // console.warn(`Conflict: Vehicle ${currentVehicleId} at node ${v_str} [${currentVeh_NodeV_EnterVicinity_abs.toFixed(1)}-${currentVeh_NodeV_ExitVicinity_abs.toFixed(1)}] overlaps with ${res.vehicleId} [${res.entryTime.toFixed(1)}-${res.exitTime.toFixed(1)}]`);
//           break; // One node conflict penalty is usually sufficient.
//         }
//       }
//     }
    
//     return totalConflictPenalty;
//   }

// --- TIME-AWARE A* ALGORITHM ---
// export function A_star_time_aware(
//     graph: Map<string, Map<string, number>>, // Road network: nodeStr -> { neighborNodeStr: distance }
//     vehicleInfo: VehicleInfoForPlanning,    // Current vehicle's details and effective start/end nodes
//     vehicleActualStartTime: number,          // Absolute simulation time this vehicle *can* start moving
//     reservations: GlobalReservations         // Existing reservations from other vehicles
// ): TimedNode[] | null { // Returns a path with timing, or null if no path found
  
//     const { 
//       effectiveStartNodeStr, 
//       effectiveEndNodeStr, 
//       speed: vehicleSpeed, 
//       length: vehicleLength,
//       id: vehicleId
//     } = vehicleInfo;
  
//     const openSet = new Map<string, AStarQueueItem>(); // Simulating a MinPriorityQueue: nodeStr -> AStarQueueItem
//     const cameFrom = new Map<string, string>(); // To reconstruct path: childNodeStr -> parentNodeStr
  
//     // gScore: cost (time in seconds) from start to a node for the current vehicle
//     const gScores = new Map<string, number>();
//     graph.forEach((_, nodeStr) => gScores.set(nodeStr, Infinity));
//     gScores.set(effectiveStartNodeStr, 0);
  
//     const startNodeLatlng = stringToLatLng(effectiveStartNodeStr);
//     const goalNodeLatlng = stringToLatLng(effectiveEndNodeStr);
  
//     const initialFScore = heuristic(startNodeLatlng, goalNodeLatlng, vehicleSpeed);
    
//     openSet.set(effectiveStartNodeStr, {
//       nodeStr: effectiveStartNodeStr,
//       gScore: 0,
//       fScore: initialFScore,
//       currentTimeAtNode: vehicleActualStartTime, // Vehicle starts at its designated absolute time
//       parentStr: undefined,
//     });
  
//     while (openSet.size > 0) {
//       // Find node in openSet with the lowest fScore (Priority Queue behavior)
//       let u_item: AStarQueueItem | undefined;
//       let minFScore = Infinity;
//       openSet.forEach(item => {
//         if (item.fScore < minFScore) {
//           minFScore = item.fScore;
//           u_item = item;
//         }
//       });
  
//       if (!u_item) break; // Should not happen if openSet is not empty
  
//       const u_str = u_item.nodeStr;
//       openSet.delete(u_str); // Remove from open set
  
//       // If goal is reached
//       if (u_str === effectiveEndNodeStr) {
//         // Reconstruct path
//         const path: TimedNode[] = [];
//         let currentTraceStr: string | undefined = u_str;
//         let reconstructionTime = u_item.currentTimeAtNode; // Time at the goal node
  
//         // Backtrack using cameFrom, calculating times along the way
//         const tempPathSegments: {node: string, parent: string | undefined, timeAtNode: number}[] = [];
//         tempPathSegments.push({node: u_str, parent: cameFrom.get(u_str), timeAtNode: reconstructionTime});
        
//         let tempCurrent = u_str;
//         while(cameFrom.has(tempCurrent)){
//           const parent = cameFrom.get(tempCurrent)!;
//           // This reconstruction of time is tricky if penalties affected gScore.
//           // The currentTimeAtNode in AStarQueueItem is more reliable.
//           // For now, let's assume gScore at parent + travel time to current = gScore at current
//           // This needs refinement if penalties are not just added to gScore.
//           // The AStarQueueItem's currentTimeAtNode is the source of truth for absolute time.
          
//           // To reconstruct path with correct times, we need to store parent's absolute time, or recalculate.
//           // The `AStarQueueItem` for `parent` isn't directly available here easily unless we store it.
//           // Simpler: store parentStr in cameFrom and reconstruct the node sequence first.
//           // Then, iterate forward to calculate times precisely.
  
//           // Let's refine path reconstruction. The `currentTimeAtNode` in `u_item` for the GOAL is correct.
//           // When backtracking, we need the time at each previous node.
//           tempCurrent = parent;
//           // This requires a way to get the time at the parent.
//           // A simpler cameFrom would store the full parent AStarQueueItem, or just the parent's currentTimeAtNode.
//           // For now, build the string path, then re-calculate times forward (less ideal).
//         }
  
//         // Simple path reconstruction (node strings only for now)
//         let currentPathNodeStr = effectiveEndNodeStr;
//         const nodeStrPath: string[] = [];
//         while(currentPathNodeStr) {
//             nodeStrPath.unshift(currentPathNodeStr);
//             if (currentPathNodeStr === effectiveStartNodeStr) break;
//             currentPathNodeStr = cameFrom.get(currentPathNodeStr)!; // Assume parent exists if not start
//             if (!currentPathNodeStr && nodeStrPath[0] !== effectiveStartNodeStr) {
//               console.error("Path reconstruction failed: cameFrom link broken for", nodeStrPath[0]);
//               return null; // Error in path reconstruction
//             }
//         }
        
//         // Now, calculate precise timings for the reconstructed path
//         const finalTimedPath: TimedNode[] = [];
//         let cumulativeTime = vehicleActualStartTime;
//         if (nodeStrPath.length > 0) {
//           finalTimedPath.push({
//             nodeStr: nodeStrPath[0],
//             latlng: stringToLatLng(nodeStrPath[0]),
//             time: cumulativeTime,
//           });
  
//           for (let i = 0; i < nodeStrPath.length - 1; i++) {
//             const fromNodeStr = nodeStrPath[i];
//             const toNodeStr = nodeStrPath[i+1];
//             const segmentDistance = graph.get(fromNodeStr)?.get(toNodeStr);
  
//             if (segmentDistance === undefined) {
//               console.error(`Path reconstruction error: Missing segment ${fromNodeStr} -> ${toNodeStr} in graph`);
//               return null;
//             }
//             const segmentTravelTime = segmentDistance / vehicleSpeed;
//             cumulativeTime += segmentTravelTime;
//             finalTimedPath.push({
//               nodeStr: toNodeStr,
//               latlng: stringToLatLng(toNodeStr),
//               time: cumulativeTime,
//             });
//           }
//         }
//         return finalTimedPath;
//       }
  
//       // Explore neighbors
//       const neighbors = graph.get(u_str);
//     if (neighbors) {
//       for (const [v_str, distance_uv] of neighbors) {
//         const baseTravelTime_uv = distance_uv / vehicleSpeed;
//         const gScoreAt_U = u_item.gScore; // This is now total effective time to reach u_str

//         const departureTimeFrom_U_abs = u_item.currentTimeAtNode;
//         const arrivalTimeAt_V_abs = departureTimeFrom_U_abs + baseTravelTime_uv;

//         // *** CALL THE NEW PENALTY FUNCTION ***
//         const estimatedDelayOrPenalty = calculateConflictPenalty_WithEstimatedDelay(
//            u_str, v_str, 
//            departureTimeFrom_U_abs, arrivalTimeAt_V_abs, 
//            vehicleId, vehicleLength, vehicleSpeed, reservations,
//            graph // *** Pass the graph ***
//         );

//         // The cost to move from U to V is baseTravelTime + estimatedDelayOrPenalty for this step
//         const cost_uv_step_effective = baseTravelTime_uv + estimatedDelayOrPenalty;
//         const final_gScore_v_effective = gScoreAt_U + cost_uv_step_effective; // Total effective time to V

//         if (final_gScore_v_effective < (gScores.get(v_str) ?? Infinity)) {
//           cameFrom.set(v_str, u_str);
//           gScores.set(v_str, final_gScore_v_effective); // Store effective time

//           const v_latlng = stringToLatLng(v_str);
//           // Heuristic should still be based on free-flow travel time, not including potential future delays
//           const hScore_v = heuristic(v_latlng, goalNodeLatlng, vehicleSpeed);
//           const fScore_v = final_gScore_v_effective + hScore_v;

//           openSet.set(v_str, {
//             nodeStr: v_str,
//             gScore: final_gScore_v_effective, // This is the key for priority queue
//             fScore: fScore_v,
//             currentTimeAtNode: arrivalTimeAt_V_abs, // Actual arrival time if this path segment is taken (ignoring the *wait* for this specific segment in THIS value for now)
//                                                   // OR: currentTimeAtNode: departureTimeFrom_U_abs + cost_uv_step_effective
//                                                   // Let's use the latter: the time it effectively arrives at V *after* any wait *for this specific step u->v*
//             parentStr: u_str,
//           });
//           }
//         }
//       }
//     }
//     return null; // No path found
//   }


  // --- CONFLICT PENALTY CALCULATION (Estimating Delay) ---
  function calculateConflictPenalty_WithEstimatedDelay(
    u_str: string,                      // Current node in A*
    v_str: string,                      // Neighbor node being considered
    departureTimeFromU_abs: number,     // Absolute time current vehicle's FRONT leaves u_str
    arrivalTimeAtV_abs: number,         // Absolute time current vehicle's FRONT arrives at v_str
    currentVehicleId: string,
    currentVehicleLength: number,
    currentVehicleSpeed: number,
    reservations: GlobalReservations,
    graph: Map<string, Map<string, number>> // Pass the graph to get segment distances
  ): number { // Returns estimated delay in seconds + inconvenience penalty
    
    let maxEstimatedDelayThisStep = 0;
    const INCONVENIENCE_PENALTY_SECONDS = 30; // Small penalty for any conflict causing a wait
  
    // --- 1. Segment Conflict Check ---
    const segmentKey_uv = u_str < v_str ? `${u_str}|${v_str}` : `${v_str}|${u_str}`;
    const segmentDistance = graph.get(u_str)?.get(v_str); // Get actual distance for this segment
    
    if (segmentDistance === undefined) {
      console.error(`calculateConflictPenalty: Segment ${u_str}-${v_str} not found in graph.`);
      return HUGE_PENALTY; // Should not happen if graph is consistent
    }
  
    const currentVeh_Seg_FrontEnters_abs = departureTimeFromU_abs;
    const timeForTailToClearSegment = (segmentDistance + currentVehicleLength) / currentVehicleSpeed;
    const currentVeh_Seg_TailExits_abs = departureTimeFromU_abs + timeForTailToClearSegment;
    
    const existingSegmentReservations = reservations.segmentOccupations.get(segmentKey_uv);
    if (existingSegmentReservations) {
      for (const res of existingSegmentReservations) {
        if (res.vehicleId === currentVehicleId) continue;
  
        // Time overlap check for the segment (current vehicle's full occupation vs. other's reservation)
        const segOverlap_startTime = Math.max(currentVeh_Seg_FrontEnters_abs, res.startTime);
        const segOverlap_endTime = Math.min(currentVeh_Seg_TailExits_abs, res.endTime);
  
        if (segOverlap_startTime < segOverlap_endTime) { // A conflict exists on the segment
          // Estimate delay: If current vehicle needs to enter the segment
          // but another vehicle's reservation (res) hasn't ended yet.
          // The current vehicle would have to wait until res.endTime.
          let currentWait = 0;
          if (res.endTime > currentVeh_Seg_FrontEnters_abs) {
            currentWait = res.endTime - currentVeh_Seg_FrontEnters_abs;
          }
          
          // Is it a potential head-on? (Simplified: other vehicle is using the segment in reverse direction during overlap)
          // This requires knowing the direction of 'res'. If 'res' was for (v_str, u_str).
          // For now, we assume any conflicting segment use is serious.
          // A more robust head-on check would look at res.nodeA_str and res.nodeB_str
          // If (res.nodeA_str === v_str && res.nodeB_str === u_str), it's a head-on during overlap.
          // Let's add a very large penalty if the *other vehicle is coming from v_str*.
          // This is a proxy for head-on.
          if (reservations.segmentOccupations.get(segmentKey_uv)?.find(r => 
              r.vehicleId === res.vehicleId && 
              ((r.nodeA_str === v_str && r.nodeB_str === u_str) || (r.nodeA_str === u_str && r.nodeB_str === v_str)) // Check res direction if stored
          )) {
               // If the reservation implies movement on this segment.
               // And if we assume the stored res.nodeA_str is the start of that vehicle's traversal of the segment:
               if ((res.nodeA_str === v_str && res.nodeB_str === u_str) && currentWait > 0) {
                   // If other vehicle is going v -> u, and we'd have to wait for it
                   // This is a strong indicator of a head-on that requires one to yield.
                   // Make this delay very significant.
                   maxEstimatedDelayThisStep = Math.max(maxEstimatedDelayThisStep, currentWait + HUGE_PENALTY / 1000); // Convert HUGE to seconds-like
                   // continue; // Don't check other reservations for this segment if head-on type is found
               }
          }
          maxEstimatedDelayThisStep = Math.max(maxEstimatedDelayThisStep, currentWait);
        }
      }
    }
  
    // --- 2. Node Conflict Check (at destination node v_str of the current edge) ---
    const currentVeh_NodeV_Arrival_abs = arrivalTimeAtV_abs; // Front arrives
    const currentVeh_NodeV_NeedsClearanceUntil_abs = arrivalTimeAtV_abs + NODE_CLEARANCE_TIME_SECONDS; // Node is "busy" by current vehicle
  
    const existingNodeVReservations = reservations.nodeOccupations.get(v_str);
    if (existingNodeVReservations) {
      for (const res of existingNodeVReservations) {
        if (res.vehicleId === currentVehicleId) continue;
  
        // Check if node v_str is reserved by 'res' when current vehicle intends to arrive or pass through
        const nodeOverlap_startTime = Math.max(currentVeh_NodeV_Arrival_abs, res.entryTime);
        // Compare with when 'res' exits OR when current vehicle is done clearing the node
        const nodeOverlap_endTime = Math.min(currentVeh_NodeV_NeedsClearanceUntil_abs, res.exitTime);
  
        if (nodeOverlap_startTime < nodeOverlap_endTime) { // Node conflict
          // If current vehicle arrives at V while 'res' is still occupying it (or its vicinity)
          // Current vehicle has to wait until res.exitTime
          let currentWait = 0;
          if (res.exitTime > currentVeh_NodeV_Arrival_abs) {
            currentWait = res.exitTime - currentVeh_NodeV_Arrival_abs;
          }
          maxEstimatedDelayThisStep = Math.max(maxEstimatedDelayThisStep, currentWait);
        }
      }
    }
    
    if (maxEstimatedDelayThisStep > 0) {
      return maxEstimatedDelayThisStep + INCONVENIENCE_PENALTY_SECONDS;
    }
    
    return 0; // No estimated delay
  }
  
// --- TIME-AWARE A* ALGORITHM (Using Estimated Delay Penalties) ---
export function A_star_time_aware(
    graph: Map<string, Map<string, number>>, // Road network: nodeStr -> { neighborNodeStr: distance }
    vehicleInfo: VehicleInfoForPlanning,    // Current vehicle's details and effective start/end nodes
    vehicleActualStartTime: number,          // Absolute simulation time this vehicle *can* start moving
    reservations: GlobalReservations         // Existing reservations from other vehicles
  ): TimedNode[] | null { // Returns a path with timing (including delays), or null
  
    const {
      effectiveStartNodeStr,
      effectiveEndNodeStr,
      speed: vehicleSpeed,
      length: vehicleLength,
      id: vehicleId
    } = vehicleInfo;
  
    // openSet stores items to visit. We'll manually find the min fScore.
    // For better performance with many nodes, a MinPriorityQueue implementation is recommended.
    const openSet = new Map<string, AStarQueueItem>(); 
    
    // cameFrom stores the parent node in the path: childNodeStr -> parentNodeStr
    const cameFrom = new Map<string, string>(); 
    
    // gScores stores the minimum known effective time (travel + estimated delays) 
    // from the start node to any other node.
    // This is relative to vehicleActualStartTime for internal A* calculation.
    const gScores = new Map<string, number>();
    graph.forEach((_, nodeStr) => gScores.set(nodeStr, Infinity));
    gScores.set(effectiveStartNodeStr, 0); // Effective time from start to start is 0
  
    const startNodeLatlng = stringToLatLng(effectiveStartNodeStr);
    const goalNodeLatlng = stringToLatLng(effectiveEndNodeStr);
  
    // Initial fScore for the start node (heuristic only, as gScore is 0)
    const initialFScore = heuristic(startNodeLatlng, goalNodeLatlng, vehicleSpeed);
    
    openSet.set(effectiveStartNodeStr, {
      nodeStr: effectiveStartNodeStr,
      gScore: 0, // Relative effective time from start
      fScore: initialFScore,
      currentTimeAtNode: vehicleActualStartTime, // Absolute simulation time at this node
      parentStr: undefined,
    });
  
    let finalGoalItem: AStarQueueItem | undefined = undefined;
  
    while (openSet.size > 0) {
      let u_item: AStarQueueItem | undefined;
      let minFScore = Infinity;
  
      // Find node in openSet with the lowest fScore
      openSet.forEach(item => {
        if (item.fScore < minFScore) {
          minFScore = item.fScore;
          u_item = item;
        }
      });
  
      if (!u_item) break; // Should not happen if openSet is not empty
  
      const u_str = u_item.nodeStr;
      openSet.delete(u_str); // Remove from open set (processed)
  
      // If goal is reached
      if (u_str === effectiveEndNodeStr) {
        finalGoalItem = u_item; // Store the goal item for path reconstruction
        break; // Path found
      }
  
      // Explore neighbors
      const neighbors = graph.get(u_str);
      if (neighbors) {
        for (const [v_str, distance_uv] of neighbors) {
          if (vehicleSpeed <= 0) continue; // Cannot move
  
          const baseTravelTime_uv = distance_uv / vehicleSpeed;
          const gScoreAt_U_effective = u_item.gScore; // Effective time to reach u_str (relative to vehicle start)
  
          // Absolute time front of vehicle would leave U (is u_item.currentTimeAtNode)
          const departureTimeFrom_U_abs = u_item.currentTimeAtNode;
          // Absolute time front of vehicle would arrive at V if there were NO waits on THIS segment u->v
          const arrivalTimeAt_V_ifNoWait_abs = departureTimeFrom_U_abs + baseTravelTime_uv;
  
          const estimatedDelayOrPenalty_uv = calculateConflictPenalty_WithEstimatedDelay(
             u_str, v_str,
             departureTimeFrom_U_abs, arrivalTimeAt_V_ifNoWait_abs, // Pass the "ideal" arrival for penalty calc
             vehicleId, vehicleLength, vehicleSpeed, reservations,
             graph
          );
  
          // The effective cost (time) to traverse this single step u->v
          const cost_uv_step_effective = baseTravelTime_uv + estimatedDelayOrPenalty_uv;
          
          // Total effective time from vehicle's start to v_str via u_str
          const final_gScore_v_effective = gScoreAt_U_effective + cost_uv_step_effective;
  
          if (final_gScore_v_effective < (gScores.get(v_str) ?? Infinity)) {
            cameFrom.set(v_str, u_str);
            gScores.set(v_str, final_gScore_v_effective); // Store relative effective time
  
            const v_latlng = stringToLatLng(v_str);
            const hScore_v = heuristic(v_latlng, goalNodeLatlng, vehicleSpeed);
            const fScore_v = final_gScore_v_effective + hScore_v;
  
            // The absolute time at node V includes the travel time for u->v AND any delay for this step
            const currentTimeAt_V_abs_effective = u_item.currentTimeAtNode + cost_uv_step_effective;
  
            openSet.set(v_str, {
              nodeStr: v_str,
              gScore: final_gScore_v_effective,
              fScore: fScore_v,
              currentTimeAtNode: currentTimeAt_V_abs_effective, // Absolute sim time arrival at V
              parentStr: u_str,
            });
          }
        }
      }
    }
  
    // --- Path Reconstruction ---
    if (!finalGoalItem) {
      return null; // Goal was not reached
    }
  
    const timedPath: TimedNode[] = [];
    let currentReconstructionNodeStr: string | undefined = finalGoalItem.nodeStr;
    
    // Backtrack using cameFrom to get the sequence of node strings
    const nodeStrSequence: string[] = [];
    while(currentReconstructionNodeStr) {
      nodeStrSequence.unshift(currentReconstructionNodeStr);
      if (currentReconstructionNodeStr === effectiveStartNodeStr) break;
      currentReconstructionNodeStr = cameFrom.get(currentReconstructionNodeStr);
      if (!currentReconstructionNodeStr && nodeStrSequence[0] !== effectiveStartNodeStr) {
          console.error("Path reconstruction error: 'cameFrom' link broken before reaching start.");
          return null; // Path is broken
      }
    }
  
    if (nodeStrSequence.length === 0 || nodeStrSequence[0] !== effectiveStartNodeStr) {
        console.error("Path reconstruction error: Path does not start at the expected start node.");
        return null;
    }
  
    // Now, construct the TimedNode array using the gScores (which represent relative effective time from start)
    // and the vehicleActualStartTime to make them absolute.
    // The currentTimeAtNode in finalGoalItem should be consistent with this if everything is correct.
    
    for (const nodeStr of nodeStrSequence) {
      const relativeEffectiveTimeToNode = gScores.get(nodeStr);
      if (relativeEffectiveTimeToNode === undefined) {
        console.error(`Path reconstruction error: No gScore found for node ${nodeStr}`);
        return null; // Should not happen for nodes in the reconstructed path
      }
      
      // For the start node, gScore is 0. Its time is vehicleActualStartTime.
      // For other nodes, gScore is relative accumulated effective time.
      const absoluteTimeAtNode = vehicleActualStartTime + relativeEffectiveTimeToNode;
      
      timedPath.push({
        nodeStr: nodeStr,
        latlng: stringToLatLng(nodeStr),
        time: absoluteTimeAtNode,
      });
    }
    
    // Sanity check: the time of the last node in timedPath should match finalGoalItem.currentTimeAtNode
    if (timedPath.length > 0 && finalGoalItem) {
        const lastTimedNodeTime = timedPath[timedPath.length -1].time;
        if (Math.abs(lastTimedNodeTime - finalGoalItem.currentTimeAtNode) > 0.1) { // Allow small float discrepancy
            console.warn(`Path reconstruction time mismatch: Last node time ${lastTimedNodeTime.toFixed(2)}, Goal item time ${finalGoalItem.currentTimeAtNode.toFixed(2)}`);
            // This might indicate an issue in how gScore vs currentTimeAtNode was handled.
            // Fallback to using finalGoalItem's parent chain if available, but the gScore method should be cleaner.
        }
    }
  
    return timedPath;
  }

  // --- MAIN ORCHESTRATION FUNCTION ---
export async function planAllVehicleRoutes(
    allRoadFeatures: FullMapFeature[],       // From your UI, richer MapFeature type
    vehicleRequests: VehicleRequest[],       // List of vehicles to plan for
    // Optional: if speed/length are truly global and not per request
    // globalVehicleSpeed?: number,
    // globalVehicleLength?: number,
  ): Promise<VehiclePathPlan[]> {
  
    const plans: VehiclePathPlan[] = [];
    const globalReservations: GlobalReservations = {
      segmentOccupations: new Map(),
      nodeOccupations: new Map(),
    };
  
    // Step 1: Build the base graph from all road features.
    // The buildGraph function from navigation.ts expects its own MapFeature type.
    // We need to ensure the FullMapFeature from ./types is compatible or adapt.
    // Assuming 'type', 'path', 'properties.isBlocked' are the key fields used by buildGraph.
    const compatibleRoadFeatures = allRoadFeatures.filter(f => f.type === 'road' || f.type === 'blocked') as OriginalMapFeature[];
    const baseGraph = buildGraph(compatibleRoadFeatures);
  
    // Step 2: Create a working copy of the graph.
    // This graph will be modified by adding projection points for all vehicle start/end locations.
    const workingGraph = new Map<string, Map<string, number>>();
    baseGraph.forEach((edges, key) => workingGraph.set(key, new Map(edges)));
  
    // Step 3: Snap all vehicle start/end points to the workingGraph and store effective nodes.
    const vehiclesWithSnappedNodes: VehicleInfoForPlanning[] = [];
  
    for (const request of vehicleRequests) {
      const startInfo = findNearestPointOnGraph_original(request.startPosition, workingGraph);
      if (!startInfo) {
        console.error(`Vehicle ${request.id}: Could not snap start point to graph.`);
        plans.push({ vehicleId: request.id, path: [], status: 'FAILED_NO_PATH', totalTimeSeconds: 0 });
        continue; // Skip this vehicle
      }
      const effectiveStartNodeStr = addPointToGraph_original(workingGraph, startInfo);
  
      const endInfo = findNearestPointOnGraph_original(request.endPosition, workingGraph);
      if (!endInfo) {
        console.error(`Vehicle ${request.id}: Could not snap end point to graph.`);
        plans.push({ vehicleId: request.id, path: [], status: 'FAILED_NO_PATH', totalTimeSeconds: 0 });
        continue; // Skip this vehicle
      }
      const effectiveEndNodeStr = addPointToGraph_original(workingGraph, endInfo);
  
      vehiclesWithSnappedNodes.push({
        ...request,
        effectiveStartNodeStr,
        effectiveEndNodeStr,
      });
    }
  
    // Step 4: Sort vehicles by their desired startTime (priority).
    // This determines the order in which paths are planned and reservations are made.
    vehiclesWithSnappedNodes.sort((a, b) => a.startTime - b.startTime);
  
    // Step 5: Plan paths sequentially for each vehicle.
    for (const vehicleInfo of vehiclesWithSnappedNodes) {
      console.log(`Planning for vehicle ${vehicleInfo.id} from ${vehicleInfo.effectiveStartNodeStr} to ${vehicleInfo.effectiveEndNodeStr} at time ${vehicleInfo.startTime}`);
  
      // The vehicleActualStartTime is its desired startTime.
      // A* will implicitly handle delays if the start node is congested by previous reservations
      // by finding a path that starts slightly later or takes a detour.
      const vehicleActualStartTime = vehicleInfo.startTime;
  
      const timedNodePath = A_star_time_aware(
        workingGraph,
        vehicleInfo,
        vehicleActualStartTime,
        globalReservations
      );
  
      if (timedNodePath && timedNodePath.length > 0) {
        const lastNode = timedNodePath[timedNodePath.length - 1];
        const firstNode = timedNodePath[0];
        const totalPathTime = lastNode.time - firstNode.time;
  
        plans.push({
          vehicleId: vehicleInfo.id,
          path: timedNodePath,
          status: 'SUCCESS',
          totalTimeSeconds: totalPathTime
        });
  
        // Add this vehicle's path to globalReservations
        for (let i = 0; i < timedNodePath.length - 1; i++) {
          const nodeA_timed = timedNodePath[i];
          const nodeB_timed = timedNodePath[i + 1];
  
          // --- Segment Reservation ---
          const segmentKey = nodeA_timed.nodeStr < nodeB_timed.nodeStr ?
                             `${nodeA_timed.nodeStr}|${nodeB_timed.nodeStr}` :
                             `${nodeB_timed.nodeStr}|${nodeA_timed.nodeStr}`;
          
          const segFrontEntersAtA_abs = nodeA_timed.time;
          const segmentDistance = calculateDistance(nodeA_timed.latlng, nodeB_timed.latlng);
          const timeForTailToClearSegment = (segmentDistance + vehicleInfo.length) / vehicleInfo.speed;
          const segTailExitsAtB_abs = segFrontEntersAtA_abs + timeForTailToClearSegment;
  
          if (!globalReservations.segmentOccupations.has(segmentKey)) {
            globalReservations.segmentOccupations.set(segmentKey, []);
          }
          globalReservations.segmentOccupations.get(segmentKey)!.push({
            vehicleId: vehicleInfo.id,
            nodeA_str: nodeA_timed.nodeStr,
            nodeB_str: nodeB_timed.nodeStr,
            startTime: segFrontEntersAtA_abs,
            endTime: segTailExitsAtB_abs,
          });
  
          // --- Node Reservation (for nodeB, as it's being ARRIVED AT/PASSED THROUGH) ---
          // Node A is also "occupied" at the start of this segment.
          // Reservation for Node A (departure node of this segment)
          const nodeA_EnterVicinity_abs = nodeA_timed.time - (SAFETY_TIME_WINDOW_NODE_SECONDS / 2);
          const nodeA_ExitVicinity_abs = nodeA_timed.time + NODE_CLEARANCE_TIME_SECONDS + (SAFETY_TIME_WINDOW_NODE_SECONDS / 2);
          
          if (!globalReservations.nodeOccupations.has(nodeA_timed.nodeStr)) {
              globalReservations.nodeOccupations.set(nodeA_timed.nodeStr, []);
          }
          globalReservations.nodeOccupations.get(nodeA_timed.nodeStr)!.push({
              vehicleId: vehicleInfo.id,
              nodeStr: nodeA_timed.nodeStr,
              entryTime: nodeA_EnterVicinity_abs,
              exitTime: nodeA_ExitVicinity_abs,
          });
          
          // Reservation for Node B (arrival node of this segment)
          if (i === timedNodePath.length - 2) { // If nodeB is the last node in path, reserve it too
              const nodeB_EnterVicinity_abs = nodeB_timed.time - (SAFETY_TIME_WINDOW_NODE_SECONDS / 2);
              const nodeB_ExitVicinity_abs = nodeB_timed.time + NODE_CLEARANCE_TIME_SECONDS + (SAFETY_TIME_WINDOW_NODE_SECONDS / 2);
              if (!globalReservations.nodeOccupations.has(nodeB_timed.nodeStr)) {
                  globalReservations.nodeOccupations.set(nodeB_timed.nodeStr, []);
              }
              globalReservations.nodeOccupations.get(nodeB_timed.nodeStr)!.push({
                  vehicleId: vehicleInfo.id,
                  nodeStr: nodeB_timed.nodeStr,
                  entryTime: nodeB_EnterVicinity_abs,
                  exitTime: nodeB_ExitVicinity_abs,
              });
          }
        }
        console.log(`Vehicle ${vehicleInfo.id} path found. Duration: ${totalPathTime.toFixed(1)}s. Nodes: ${timedNodePath.length}`);
      } else {
        console.warn(`No path found for vehicle ${vehicleInfo.id} under current constraints.`);
        plans.push({ 
          vehicleId: vehicleInfo.id, 
          path: [], 
          status: 'FAILED_NO_PATH', 
          totalTimeSeconds: 0 
        });
      }
    }
    return plans;
  }