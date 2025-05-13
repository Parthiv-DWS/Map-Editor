import { useState, useEffect, useRef, useCallback } from 'react';
import { Bounds } from '@/lib/types';

interface UseMapProps {
  initialBounds: Bounds;
  onBoundsChanged?: (bounds: google.maps.LatLngBounds) => void;
}

export default function useMap({ initialBounds, onBoundsChanged }: UseMapProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const boundsRectangle = useRef<google.maps.Rectangle | null>(null);

  // Initialize Google Map
  const initMap = useCallback((containerRef: HTMLDivElement) => {
    if (!containerRef || isInitialized) return;
    
    mapRef.current = containerRef;
    
    const mapOptions: google.maps.MapOptions = {
      center: {
        lat: (initialBounds.north + initialBounds.south) / 2,
        lng: (initialBounds.east + initialBounds.west) / 2
      },
      zoom: 17,
      mapTypeId: 'satellite',
      disableDefaultUI: false,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      restriction: {
        latLngBounds: initialBounds,
        strictBounds: true,
      }
    };
    
    const newMap = new google.maps.Map(containerRef, mapOptions);
    
    // Add bounds rectangle
    boundsRectangle.current = new google.maps.Rectangle({
      bounds: new google.maps.LatLngBounds(
        new google.maps.LatLng(initialBounds.south, initialBounds.west),
        new google.maps.LatLng(initialBounds.north, initialBounds.east)
      ),
      map: newMap,
      strokeColor: '#3B82F6',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#3B82F6',
      fillOpacity: 0.05,
      editable: false,
      clickable: false,
    });
    
    setMap(newMap);
    setIsInitialized(true);
    
    return () => {
      if (boundsRectangle.current) {
        boundsRectangle.current.setMap(null);
      }
    };
  }, [initialBounds, isInitialized]);

  // Update map bounds
  const updateBounds = useCallback((bounds: Bounds) => {
    if (!map || !boundsRectangle.current) return;
    
    const newLatLngBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(bounds.south, bounds.west),
      new google.maps.LatLng(bounds.north, bounds.east)
    );
    
    // Update rectangle bounds
    boundsRectangle.current.setBounds(newLatLngBounds);
    
    // Update map restriction
    map.setOptions({
      restriction: {
        latLngBounds: bounds,
        strictBounds: true,
      }
    });
    
    // Center the map within the new bounds
    map.fitBounds(newLatLngBounds);
  }, [map]);

  // Set up map event listeners
  useEffect(() => {
    if (!map || !onBoundsChanged) return;
    
    const listener = map.addListener('bounds_changed', () => {
      if (onBoundsChanged) {
        onBoundsChanged(map.getBounds()!);
      }
    });
    
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, onBoundsChanged]);

  // Toggle satellite view
  const toggleSatelliteView = useCallback(() => {
    if (!map) return;
    const currentMapType = map.getMapTypeId();
    map.setMapTypeId(currentMapType === 'satellite' ? 'roadmap' : 'satellite');
  }, [map]);

  // Center the map on the bounds
  const centerMap = useCallback(() => {
    if (!map || !boundsRectangle.current) return;
    const bounds = boundsRectangle.current.getBounds();
    if (bounds) {
      map.fitBounds(bounds);
    }
  }, [map]);

  // Zoom in
  const zoomIn = useCallback(() => {
    if (!map) return;
    map.setZoom((map.getZoom() || 0) + 1);
  }, [map]);

  // Zoom out
  const zoomOut = useCallback(() => {
    if (!map) return;
    map.setZoom((map.getZoom() || 0) - 1);
  }, [map]);

  return {
    map,
    isInitialized,
    initMap,
    updateBounds,
    toggleSatelliteView,
    centerMap,
    zoomIn,
    zoomOut,
  };
}
