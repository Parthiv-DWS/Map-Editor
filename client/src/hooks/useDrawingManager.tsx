import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DrawingMode, MapFeature, RoadStyle } from '@/lib/types';

interface UseDrawingManagerProps {
  map: google.maps.Map | null;
  onFeatureCreate?: (feature: MapFeature) => void;
  onFeatureUpdate?: (feature: MapFeature) => void;
  onFeatureDelete?: (featureId: string) => void;
  features: MapFeature[];
  roadStyle: RoadStyle;
}

export default function useDrawingManager({
  map,
  onFeatureCreate,
  onFeatureUpdate,
  onFeatureDelete,
  features,
  roadStyle,
}: UseDrawingManagerProps) {
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('SELECT');
  const [featureOverlays, setFeatureOverlays] = useState<Map<string, google.maps.MVCObject>>(new Map());
  const [selectedFeature, setSelectedFeature] = useState<{id: string, overlay: google.maps.MVCObject} | null>(null);

  // Initialize drawing manager
  useEffect(() => {
    if (!map) return;

    const manager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polylineOptions: {
        strokeColor: roadStyle.color,
        strokeWeight: roadStyle.width,
        editable: false,
        draggable: false,
      },
      polygonOptions: {
        fillColor: roadStyle.color,
        fillOpacity: 0.2,
        strokeColor: roadStyle.color,
        strokeWeight: 2,
        editable: false,
        draggable: false,
      },
      markerOptions: {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: roadStyle.color,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
        draggable: false,
      },
    });

    manager.setMap(map);
    setDrawingManager(manager);

    return () => {
      manager.setMap(null);
    };
  }, [map, roadStyle]);

  // Update drawing options when roadStyle changes
  useEffect(() => {
    if (!drawingManager) return;

    drawingManager.setOptions({
      polylineOptions: {
        ...drawingManager.get('polylineOptions'),
        strokeColor: roadStyle.color,
        strokeWeight: roadStyle.width,
      },
      polygonOptions: {
        ...drawingManager.get('polygonOptions'),
        fillColor: roadStyle.color,
        strokeColor: roadStyle.color,
      },
      markerOptions: {
        ...drawingManager.get('markerOptions'),
        icon: {
          ...drawingManager.get('markerOptions').icon,
          fillColor: roadStyle.color,
        },
      },
    });
  }, [drawingManager, roadStyle]);

  // Set up event listeners for new features
  useEffect(() => {
    if (!drawingManager || !map) return;

    const polylineCompleteListener = google.maps.event.addListener(
      drawingManager,
      'polylinecomplete',
      (polyline: google.maps.Polyline) => {
        const path = polyline.getPath().getArray().map(latLng => ({
          lat: latLng.lat(),
          lng: latLng.lng(),
        }));

        const newFeature: MapFeature = {
          id: uuidv4(),
          type: 'road',
          path,
          properties: {
            color: roadStyle.color,
            width: roadStyle.width,
            isBlocked: false,
          },
        };

        // Make the polyline not editable initially after creation
        polyline.setEditable(false);
        polyline.setDraggable(false);

        if (onFeatureCreate) {
          onFeatureCreate(newFeature);
        }

        // Add to overlay map
        setFeatureOverlays(prev => new Map(prev).set(newFeature.id, polyline));

        // Switch back to SELECT mode after drawing
        setDrawingMode('SELECT');
        drawingManager.setDrawingMode(null);
      }
    );

    const polygonCompleteListener = google.maps.event.addListener(
      drawingManager,
      'polygoncomplete',
      (polygon: google.maps.Polygon) => {
        const path = polygon.getPath().getArray().map(latLng => ({
          lat: latLng.lat(),
          lng: latLng.lng(),
        }));

        const newFeature: MapFeature = {
          id: uuidv4(),
          type: 'polygon',
          path,
          properties: {
            color: roadStyle.color,
            width: 2,
          },
        };

        // Make the polygon not editable initially after creation
        polygon.setEditable(false);
        polygon.setDraggable(false);

        if (onFeatureCreate) {
          onFeatureCreate(newFeature);
        }

        // Add to overlay map
        setFeatureOverlays(prev => new Map(prev).set(newFeature.id, polygon));

        // Switch back to SELECT mode after drawing
        setDrawingMode('SELECT');
        drawingManager.setDrawingMode(null);
      }
    );

    const markerCompleteListener = google.maps.event.addListener(
      drawingManager,
      'markercomplete',
      (marker: google.maps.Marker) => {
        const position = marker.getPosition();
        if (!position) return;

        const newFeature: MapFeature = {
          id: uuidv4(),
          type: 'marker',
          position: {
            lat: position.lat(),
            lng: position.lng(),
          },
          properties: {
            color: roadStyle.color,
            name: 'Marker',
          },
        };

        // Make the marker draggable
        marker.setDraggable(false);

        if (onFeatureCreate) {
          onFeatureCreate(newFeature);
        }

        // Add to overlay map
        setFeatureOverlays(prev => new Map(prev).set(newFeature.id, marker));

        // Switch back to SELECT mode after placing a marker
        setDrawingMode('SELECT');
        drawingManager.setDrawingMode(null);
      }
    );

    return () => {
      google.maps.event.removeListener(polylineCompleteListener);
      google.maps.event.removeListener(polygonCompleteListener);
      google.maps.event.removeListener(markerCompleteListener);
    };
  }, [drawingManager, map, roadStyle, onFeatureCreate]);

  // Render existing features from MapData
  useEffect(() => {
    if (!map) return;

    // Clear existing overlays
    featureOverlays.forEach(overlay => {
      if (overlay instanceof google.maps.Marker) {
        overlay.setMap(null);
      } else if (overlay instanceof google.maps.Polyline || overlay instanceof google.maps.Polygon) {
        overlay.setMap(null);
      }
    });

    // Create new Map for overlays
    const newOverlays = new Map<string, google.maps.MVCObject>();

    // Add each feature as an overlay
    features.forEach(feature => {
      let overlay: google.maps.MVCObject | null = null;

      if (feature.type === 'road' || feature.type === 'blocked') {
        if (!feature.path) return;

        const path = feature.path.map(point => new google.maps.LatLng(point.lat, point.lng));
        
        const polyline = new google.maps.Polyline({
          path,
          map,
          strokeColor: feature.properties.color,
          strokeWeight: feature.properties.width || roadStyle.width,
          strokeOpacity: 1.0,
          editable: false,
          draggable: false,
        });

        // Add special styling for blocked roads
        if (feature.type === 'blocked' || feature.properties.isBlocked) {
          switch (roadStyle.blockStyle) {
            case 'dashed':
              polyline.setOptions({
                strokeOpacity: 0.7,
                strokePattern: [
                  {
                    icon: {
                      path: google.maps.SymbolPath.CIRCLE,
                      scale: 3,
                      fillOpacity: 1,
                      fillColor: feature.properties.color,
                    },
                    repeat: '10px',
                  },
                ],
              });
              break;
            case 'highlight':
              polyline.setOptions({
                strokeOpacity: 0.8,
                strokeColor: '#FF0000',
              });
              break;
            // solid style is the default
          }
        }

        overlay = polyline;
        
        // Add click event for selection
        google.maps.event.addListener(polyline, 'click', () => {
          if (drawingMode === 'SELECT') {
            selectFeature(feature.id, polyline);
          } else if (drawingMode === 'ERASE') {
            deleteFeature(feature.id);
          } else if (drawingMode === 'BLOCK' && feature.type === 'road') {
            toggleBlockRoad(feature.id);
          }
        });
      } else if (feature.type === 'polygon') {
        if (!feature.path) return;

        const path = feature.path.map(point => new google.maps.LatLng(point.lat, point.lng));
        
        const polygon = new google.maps.Polygon({
          paths: path,
          map,
          strokeColor: feature.properties.color,
          strokeWeight: feature.properties.width || 2,
          strokeOpacity: 0.8,
          fillColor: feature.properties.color,
          fillOpacity: 0.2,
          editable: false,
          draggable: false,
        });

        overlay = polygon;
        
        // Add click event for selection
        google.maps.event.addListener(polygon, 'click', () => {
          if (drawingMode === 'SELECT') {
            selectFeature(feature.id, polygon);
          } else if (drawingMode === 'ERASE') {
            deleteFeature(feature.id);
          }
        });
      } else if (feature.type === 'marker' && feature.position) {
        const marker = new google.maps.Marker({
          position: new google.maps.LatLng(feature.position.lat, feature.position.lng),
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: feature.properties.color,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
          draggable: false,
        });

        overlay = marker;
        
        // Add click event for selection
        google.maps.event.addListener(marker, 'click', () => {
          if (drawingMode === 'SELECT') {
            selectFeature(feature.id, marker);
          } else if (drawingMode === 'ERASE') {
            deleteFeature(feature.id);
          }
        });
      }

      if (overlay) {
        newOverlays.set(feature.id, overlay);
      }
    });

    setFeatureOverlays(newOverlays);

    return () => {
      newOverlays.forEach(overlay => {
        if (overlay instanceof google.maps.Marker) {
          overlay.setMap(null);
        } else if (overlay instanceof google.maps.Polyline || overlay instanceof google.maps.Polygon) {
          overlay.setMap(null);
        }
        
        // Remove event listeners
        google.maps.event.clearInstanceListeners(overlay);
      });
    };
  }, [map, features, drawingMode, roadStyle.blockStyle, roadStyle.width]);

  // Handle drawing mode changes
  const setMode = useCallback((mode: DrawingMode) => {
    if (!drawingManager) return;

    // Clear selection when changing modes
    if (selectedFeature) {
      clearSelection();
    }

    setDrawingMode(mode);

    // Set the appropriate drawing mode in the drawing manager
    switch (mode) {
      case 'ROAD':
        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYLINE);
        break;
      case 'POLYGON':
        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
        break;
      case 'MARKER':
        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
        break;
      default:
        drawingManager.setDrawingMode(null);
    }
  }, [drawingManager, selectedFeature]);

  // Select a feature
  const selectFeature = useCallback((featureId: string, overlay: google.maps.MVCObject) => {
    // Clear any existing selection
    clearSelection();

    // Set the feature as editable
    if (overlay instanceof google.maps.Polyline || overlay instanceof google.maps.Polygon) {
      overlay.setEditable(true);
      overlay.setDraggable(true);

      // Add listener for path changes
      const pathChangeListener = overlay instanceof google.maps.Polyline
        ? google.maps.event.addListener(overlay.getPath(), 'set_at', () => updateFeatureFromOverlay(featureId, overlay))
        : google.maps.event.addListener(overlay.getPath(), 'set_at', () => updateFeatureFromOverlay(featureId, overlay));

      const insertAtListener = overlay instanceof google.maps.Polyline
        ? google.maps.event.addListener(overlay.getPath(), 'insert_at', () => updateFeatureFromOverlay(featureId, overlay))
        : google.maps.event.addListener(overlay.getPath(), 'insert_at', () => updateFeatureFromOverlay(featureId, overlay));

      const removeAtListener = overlay instanceof google.maps.Polyline
        ? google.maps.event.addListener(overlay.getPath(), 'remove_at', () => updateFeatureFromOverlay(featureId, overlay))
        : google.maps.event.addListener(overlay.getPath(), 'remove_at', () => updateFeatureFromOverlay(featureId, overlay));

      // Set the selected feature with listeners
      setSelectedFeature({
        id: featureId,
        overlay,
      });
    } else if (overlay instanceof google.maps.Marker) {
      overlay.setDraggable(true);

      // Add listener for position changes
      const dragEndListener = google.maps.event.addListener(overlay, 'dragend', () => {
        const position = overlay.getPosition();
        if (!position) return;

        const feature = features.find(f => f.id === featureId);
        if (!feature) return;

        const updatedFeature: MapFeature = {
          ...feature,
          position: {
            lat: position.lat(),
            lng: position.lng(),
          },
        };

        if (onFeatureUpdate) {
          onFeatureUpdate(updatedFeature);
        }
      });

      // Set the selected feature with listeners
      setSelectedFeature({
        id: featureId,
        overlay,
      });
    }
  }, [features, onFeatureUpdate]);

  // Update feature from overlay
  const updateFeatureFromOverlay = useCallback((featureId: string, overlay: google.maps.MVCObject) => {
    const feature = features.find(f => f.id === featureId);
    if (!feature) return;

    let updatedFeature: MapFeature;

    if ((overlay instanceof google.maps.Polyline || overlay instanceof google.maps.Polygon) && 
        (feature.type === 'road' || feature.type === 'polygon' || feature.type === 'blocked')) {
      const path = overlay.getPath().getArray().map(latLng => ({
        lat: latLng.lat(),
        lng: latLng.lng(),
      }));

      updatedFeature = {
        ...feature,
        path,
      };

      if (onFeatureUpdate) {
        onFeatureUpdate(updatedFeature);
      }
    }
  }, [features, onFeatureUpdate]);

  // Clear selection
  const clearSelection = useCallback(() => {
    if (!selectedFeature) return;

    const { overlay } = selectedFeature;

    if (overlay instanceof google.maps.Polyline || overlay instanceof google.maps.Polygon) {
      overlay.setEditable(false);
      overlay.setDraggable(false);
      google.maps.event.clearListeners(overlay.getPath(), 'set_at');
      google.maps.event.clearListeners(overlay.getPath(), 'insert_at');
      google.maps.event.clearListeners(overlay.getPath(), 'remove_at');
    } else if (overlay instanceof google.maps.Marker) {
      overlay.setDraggable(false);
      google.maps.event.clearListeners(overlay, 'dragend');
    }

    setSelectedFeature(null);
  }, [selectedFeature]);

  // Delete a feature
  const deleteFeature = useCallback((featureId: string) => {
    const overlay = featureOverlays.get(featureId);
    
    if (overlay) {
      if (overlay instanceof google.maps.Marker) {
        overlay.setMap(null);
      } else if (overlay instanceof google.maps.Polyline || overlay instanceof google.maps.Polygon) {
        overlay.setMap(null);
      }
      
      // Remove from overlays map
      setFeatureOverlays(prev => {
        const newMap = new Map(prev);
        newMap.delete(featureId);
        return newMap;
      });
      
      // Clear selection if this was the selected feature
      if (selectedFeature && selectedFeature.id === featureId) {
        setSelectedFeature(null);
      }
      
      if (onFeatureDelete) {
        onFeatureDelete(featureId);
      }
    }
  }, [featureOverlays, selectedFeature, onFeatureDelete]);

  // Toggle road blocking
  const toggleBlockRoad = useCallback((featureId: string) => {
    const feature = features.find(f => f.id === featureId);
    const overlay = featureOverlays.get(featureId);
    
    if (!feature || !overlay || !(overlay instanceof google.maps.Polyline)) {
      return;
    }
    
    const isBlocked = !feature.properties.isBlocked;
    
    const updatedFeature: MapFeature = {
      ...feature,
      type: isBlocked ? 'blocked' : 'road',
      properties: {
        ...feature.properties,
        isBlocked,
      },
    };
    
    if (onFeatureUpdate) {
      onFeatureUpdate(updatedFeature);
    }
  }, [features, featureOverlays, onFeatureUpdate]);

  return {
    drawingMode,
    setMode,
    clearSelection,
    deleteFeature,
    toggleBlockRoad,
  };
}
