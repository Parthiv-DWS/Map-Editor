import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface ActionInfoProps {
  title: string;
  description: string;
}

interface MapContainerProps {
  onMapInit: (containerRef: HTMLDivElement) => void;
  onSidebarToggle: () => void;
  actionInfo?: ActionInfoProps;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleSatellite: () => void;
  onCenterMap: () => void;
}

export default function MapContainer({
  onMapInit,
  onSidebarToggle,
  actionInfo,
  onZoomIn,
  onZoomOut,
  onToggleSatellite,
  onCenterMap,
}: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  
  useEffect(() => {
    if (mapRef.current && !isMapInitialized) {
      onMapInit(mapRef.current);
      setIsMapInitialized(true);
    }
  }, [onMapInit, isMapInitialized]);
  
  return (
    <div className="flex-1 relative">
      <div 
        ref={mapRef}
        className="map-container absolute inset-0 rounded-lg overflow-hidden"
      />
      
      {/* Map controls overlay */}
      <div className="absolute top-4 right-4 flex flex-col space-y-2">
        <div className="bg-white rounded-lg shadow-md p-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onZoomIn}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <span className="material-icons">add</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onZoomOut}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <span className="material-icons">remove</span>
          </Button>
        </div>
        <div className="bg-white rounded-lg shadow-md p-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSatellite}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Toggle satellite view"
          >
            <span className="material-icons">satellite</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCenterMap}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Center map"
          >
            <span className="material-icons">my_location</span>
          </Button>
        </div>
      </div>
      
      {/* Drag handle for mobile */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 flex justify-center py-2 bg-white border-t border-gray-200 rounded-t-lg">
        <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
      </div>
      
      {/* Current action info panel */}
      {actionInfo && (
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-md p-3 text-sm max-w-xs">
          <div className="font-medium mb-1">{actionInfo.title}</div>
          <div className="text-gray-600 text-xs">{actionInfo.description}</div>
        </div>
      )}
      
      {/* Mobile toggle button */}
      <Button
        variant="default"
        size="icon"
        className="md:hidden absolute top-4 left-4 bg-white rounded-full shadow-md p-2 z-20"
        onClick={onSidebarToggle}
      >
        <span className="material-icons">menu</span>
      </Button>
    </div>
  );
}
