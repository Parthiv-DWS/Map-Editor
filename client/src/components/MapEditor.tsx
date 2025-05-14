import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import SidebarPanel from './SidebarPanel';
import MapContainer from './MapContainer';
import HelpModal from './HelpModal';
import ResetModal from './ResetModal';
import useMap from '@/hooks/useMap';
import useDrawingManager from '@/hooks/useDrawingManager';
import useMapStorage from '@/hooks/useMapStorage';
import { Bounds, DrawingMode, MapFeature, RoadStyle } from '@/lib/types';
import { DEFAULT_BOUNDS } from '@/lib/storage';

export default function MapEditor() {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('SELECT');
  const [roadStyle, setRoadStyle] = useState<RoadStyle>({
    color: '#3B82F6',
    width: 7,
    blockStyle: 'highlight',
  });
  
  const { toast } = useToast();
  const { 
    mapData, 
    isLoading,
    addFeature,
    updateFeature,
    deleteFeature,
    clearData,
    updateBounds,
    exportData,
    importData,
  } = useMapStorage();
  
  const bounds = mapData?.bounds || DEFAULT_BOUNDS;
  
  const { 
    map, 
    initMap, 
    updateBounds: updateMapBounds,
    toggleSatelliteView,
    centerMap,
    zoomIn,
    zoomOut,
  } = useMap({ 
    initialBounds: bounds,
    onBoundsChanged: (newBounds) => {
      // This is intentionally left empty as we don't need to react to every bounds change
    },
  });
  
  const { 
    drawingMode: activeDrawingMode,
    setMode,
    deleteFeature: deleteMapFeature,
    toggleBlockRoad,
  } = useDrawingManager({
    map,
    features: mapData.features,
    roadStyle,
    onFeatureCreate: (feature) => {
      addFeature(feature);
      toast({ 
        title: 'Feature Created', 
        description: `New ${feature.type} has been added to the map` 
      });
    },
    onFeatureUpdate: updateFeature,
    onFeatureDelete: deleteFeature,
  });
  
  // Sync drawing mode between components
  useEffect(() => {
    setMode(drawingMode);
  }, [drawingMode, setMode]);
  
  // Handler for changing drawing mode
  const handleModeChange = useCallback((mode: DrawingMode) => {
    setDrawingMode(mode);
    toast({ 
      title: 'Tool Selected', 
      description: `${getToolDescription(mode)} tool is now active` 
    });
    
    // Close sidebar on mobile when a tool is selected
    if (window.innerWidth < 768) {
      setSidebarVisible(false);
    }
  }, [toast]);
  
  // Handler for road style changes
  const handleRoadStyleChange = useCallback((style: Partial<RoadStyle>) => {
    setRoadStyle(prev => ({ ...prev, ...style }));
  }, []);
  
  // Handler for bounds changes
  const handleBoundsChange = useCallback((newBounds: Bounds) => {
    // Do nothing here, we'll apply the bounds when the Apply button is clicked
  }, []);
  
  // Handler for applying bounds
  const handleApplyBounds = useCallback((updatedBounds: Bounds) => {
    const newBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(updatedBounds.south, updatedBounds.west),
      new google.maps.LatLng(updatedBounds.north, updatedBounds.east)
    );
    
    updateMapBounds(updatedBounds);
    updateBounds(newBounds);
    
    toast({ 
      title: 'Bounds Updated', 
      description: 'Map boundaries have been updated' 
    });
  }, [bounds, updateMapBounds, updateBounds, toast]);
  
  // Handler for saving data
  const handleSave = useCallback(() => {
    toast({ 
      title: 'Saved Successfully', 
      description: 'Your map changes have been saved locally' 
    });
  }, [toast]);
  
  // Get action info based on current drawing mode
  const getActionInfo = useCallback(() => {
    switch (drawingMode) {
      case 'ROAD':
        return {
          title: 'Adding new road',
          description: 'Click on the map to place points. Double-click to finish.',
        };
      case 'MARKER':
        return {
          title: 'Adding marker',
          description: 'Click on the map to place a marker.',
        };
      case 'POLYGON':
        return {
          title: 'Adding area',
          description: 'Click on the map to place points. Complete the shape by clicking on the first point.',
        };
      case 'ERASE':
        return {
          title: 'Delete mode',
          description: 'Click on a feature to delete it.',
        };
      case 'BLOCK':
        return {
          title: 'Block road mode',
          description: 'Click on a road to mark it as blocked.',
        };
      case 'NAVIGATE':
        return {
          title: 'Navigate',
          description: 'Select a start and end point to calculate the route.',
        };
      case 'SELECT':
      default:
        return {
          title: 'Select mode',
          description: 'Click on a feature to select and edit it.',
        };
    }
  }, [drawingMode]);
  
  // Get tool description for toast
  function getToolDescription(mode: DrawingMode): string {
    switch (mode) {
      case 'SELECT':
        return 'Select';
      case 'ROAD':
        return 'Add Road';
      case 'MARKER':
        return 'Add Marker';
      case 'POLYGON':
        return 'Add Area';
      case 'ERASE':
        return 'Delete';
      case 'BLOCK':
        return 'Block Road';
      case 'NAVIGATE':
        return 'Navigate';
      default:
        return '';
    }
  }
  
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-800">Interactive Map Editor</h1>
          </div>
          <div className="flex items-center space-x-4">
            <HelpModal />
            <ResetModal onReset={clearData} />
            <Button 
              onClick={handleSave}
              className="bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-600 transition"
            >
              <span className="material-icons mr-1">save</span>
              <span className="hidden md:inline">Save</span>
            </Button>
          </div>
        </div>
      </header>
      
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <SidebarPanel
          drawingMode={drawingMode}
          onModeChange={handleModeChange}
          bounds={bounds}
          onBoundsChange={handleBoundsChange}
          onApplyBounds={handleApplyBounds}
          roadStyle={roadStyle}
          onRoadStyleChange={handleRoadStyleChange}
          onExport={exportData}
          onImport={importData}
          isVisible={sidebarVisible}
          onToggle={() => setSidebarVisible(!sidebarVisible)}
        />
        
        {/* Map Container */}
        <MapContainer
          onMapInit={initMap}
          onSidebarToggle={() => setSidebarVisible(!sidebarVisible)}
          actionInfo={getActionInfo()}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onToggleSatellite={toggleSatelliteView}
          onCenterMap={centerMap}
        />
      </div>
    </div>
  );
}