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
import { Bounds, DrawingMode, LatLng, RoadStyle } from '@/lib/types';
import { DEFAULT_BOUNDS } from '@/lib/storage';import {
  planAllVehicleRoutes,
  VehiclePathPlan,
  VehicleRequest, // Make sure this is exported from multiVehicleNavigation.ts
} from '@/lib/multiVehicleNavigation'; // Adjust path if needed
import { v4 as uuidv4 } from 'uuid'; 
import { DEFAULT_TRAILER_LENGTH, DEFAULT_TRAILER_SPEED } from '@/lib/utils';

export default function MapEditor() {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('SELECT');
  const [roadStyle, setRoadStyle] = useState<RoadStyle>({
    color: '#3B82F6',
    width: 10,
    blockStyle: 'highlight',
  });

   // --- NEW STATES FOR MULTI-TRAILER NAVIGATION ---
   const [multiNavRequests, setMultiNavRequests] = useState<VehicleRequest[]>([]);
   const [currentMultiNavStep, setCurrentMultiNavStep] = useState<'IDLE' | 'SET_START' | 'SET_END'>('IDLE');
   // Stores the startPosition while waiting for the endPosition click
   const [pendingMultiNavRequestStart, setPendingMultiNavRequestStart] = useState<LatLng | null>(null); 
   
   // To store Google Maps Polyline objects for multi-nav paths
   const [multiNavPathOverlays, setMultiNavPathOverlays] = useState<google.maps.Polyline[]>([]);
   // To store Google Maps Marker objects for start/end points of each request
   const [multiNavRequestMarkerOverlays, setMultiNavRequestMarkerOverlays] = useState<google.maps.Marker[]>([])
  
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
    setMode,
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
  
  function triggerVibrationAlert(durationOrPattern: number | number[]) {
    if ('vibrate' in navigator) { // A more robust check for the method
      try {
        const success = navigator.vibrate(durationOrPattern);
        if (success) {
          console.log('Vibration initiated successfully.');
        } else {
          console.warn('Vibration command was not successful (e.g., pattern too long, or other internal error).');
        }
      } catch (error) {
        console.error('Error attempting to vibrate:', error);
      }
    } else {
      console.log('Vibration API not supported in this browser or device.');
    }
  }

  function showAlert(message : string) {
    console.log("Alert:", message);
    triggerVibrationAlert(300);
  }
  // Handler for changing drawing mode
  const handleModeChange = useCallback((mode: DrawingMode) => {
    if (mode === 'VIBRATE') {
      showAlert("Important Update!");
      return;
    }
    // Setup or teardown for MULTI_NAVIGATE mode
    if (mode === 'MULTI_NAVIGATE') {
      setCurrentMultiNavStep('SET_START');
      setPendingMultiNavRequestStart(null);
      // Don't clear existing requests automatically, user might want to add more.
      // Clear previously drawn multi-nav paths and temporary markers for a fresh planning session.
      multiNavPathOverlays.forEach(p => p.setMap(null));
      setMultiNavPathOverlays([]);
      // Keep request markers if user is just re-planning, or clear if starting totally fresh.
      // For now, let's clear temporary markers used for *defining* new requests if any.
      // Actual request markers (S1, E1, S2, E2) will be handled more explicitly.
      
    }
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

  useEffect(() => {
    if (!map || drawingMode !== 'MULTI_NAVIGATE' || !google) return; // Ensure google is loaded

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const clickedLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };

      if (currentMultiNavStep === 'SET_START') {
        setPendingMultiNavRequestStart(clickedLatLng);
        setCurrentMultiNavStep('SET_END');
        
        // Add a temporary start marker for the *current* request being defined
        const tempStartMarker = new google.maps.Marker({
            position: clickedLatLng, 
            map, 
            label: `S${multiNavRequests.length + 1}`, // Tentative label
            icon: { 
                path: google.maps.SymbolPath.CIRCLE, 
                scale: 7, 
                fillColor: '#3498db', // Blueish for start
                fillOpacity: 1, 
                strokeColor: 'white', 
                strokeWeight: 1.5 
            },
            zIndex: google.maps.Marker.MAX_ZINDEX + 1 // Ensure it's on top
        });
        // Add to a temporary list if you want to clear only these "in-progress" markers
        // For now, we'll add all to multiNavRequestMarkerOverlays and clear them more broadly.
        setMultiNavRequestMarkerOverlays(prev => [...prev, tempStartMarker]);

      } else if (currentMultiNavStep === 'SET_END' && pendingMultiNavRequestStart) {
        const newRequest: VehicleRequest = {
          id: uuidv4(),
          startPosition: pendingMultiNavRequestStart,
          endPosition: clickedLatLng,
          speed: DEFAULT_TRAILER_SPEED,
          length: DEFAULT_TRAILER_LENGTH,
          // Stagger start times by 30s per request, make this configurable later
          startTime: multiNavRequests.length === 0 ? 0 : 
          (multiNavRequests[multiNavRequests.length -1].startTime + 30),
        };
        setMultiNavRequests(prev => [...prev, newRequest]);
        
        // Add an end marker for the *completed* request definition
        const endMarker = new google.maps.Marker({
            position: clickedLatLng, 
            map, 
            label: `E${multiNavRequests.length + 1}`, // +1 because state update is async
            icon: { 
                path: google.maps.SymbolPath.CIRCLE, 
                scale: 7, 
                fillColor: '#e74c3c', // Reddish for end
                fillOpacity: 1, 
                strokeColor: 'white', 
                strokeWeight: 1.5
            },
            zIndex: google.maps.Marker.MAX_ZINDEX + 1
        });
        setMultiNavRequestMarkerOverlays(prev => [...prev, endMarker]);
        
        setPendingMultiNavRequestStart(null); // Reset for next request
        setCurrentMultiNavStep('SET_START');   // Ready for next request's start point
      }
    });

    return () => {
      google.maps.event.removeListener(clickListener);
    };
  }, [map, google, drawingMode, currentMultiNavStep, pendingMultiNavRequestStart, multiNavRequests]);

  // MapEditor.tsx

  const clearAllMultiNavData = useCallback(() => {
    multiNavRequestMarkerOverlays.forEach(m => m.setMap(null));
    setMultiNavRequestMarkerOverlays([]);
    multiNavPathOverlays.forEach(p => p.setMap(null));
    setMultiNavPathOverlays([]);
    setMultiNavRequests([]);
    setCurrentMultiNavStep('SET_START'); // Ready to define new requests
    setPendingMultiNavRequestStart(null);
    toast({ title: "Multi-Navigation Cleared", description: "All trailer requests and paths have been removed." });
  }, [multiNavRequestMarkerOverlays, multiNavPathOverlays, toast]);


  const handleCalculateMultiTrailerPaths = useCallback(async () => {
    if (multiNavRequests.length === 0) {
      toast({ variant: "destructive", title: "No Requests", description: "Please define at least one trailer navigation request." });
      return;
    }
    
    // Clear previous paths from map
    multiNavPathOverlays.forEach(p => p.setMap(null));
    setMultiNavPathOverlays([]);

    toast({ title: "Calculating Paths...", description: "Please wait while routes are planned." });

    try {
      const resultingPlans: VehiclePathPlan[] = await planAllVehicleRoutes(
        mapData.features, // Pass your current map features
        multiNavRequests
      );
      
      const newPathOverlays: google.maps.Polyline[] = [];
      const pathColors = [
        '#FF69B4', // HotPink
        '#FFFF00', // Yellow
        '#FFA500', // Orange
        '#ADFF2F', // GreenYellow
        '#00FFFF', // Cyan/Aqua
        '#FF00FF', // Magenta
        '#FA8072', // Salmon
        '#DA70D6', // Orchid
        '#FFFFFF', // White (might need an outline if roads are complex)
      ];

      resultingPlans.forEach((plan, index) => {
        if (plan.status === 'SUCCESS' && plan.path.length > 0) {
          const googlePath = plan.path.map(tn => ({ lat: tn.latlng.lat, lng: tn.latlng.lng }));
          let icons: google.maps.IconSequence[] | undefined = undefined;
          const strokeColor = pathColors[index % pathColors.length];

          const polyline = new google.maps.Polyline({
            path: googlePath,
            map: map, // your google.maps.Map instance
            strokeColor: strokeColor,
            strokeWeight:  6, // Make first path slightly thicker
            strokeOpacity: 1,
            zIndex:  100 + (resultingPlans.length - 1 - index), // Draw earlier paths on top
            icons: icons = [{
              icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 3,
                strokeColor: '#000000', // Arrow outline
                strokeWeight: 0.5,
                fillColor: strokeColor, // Match line, or a contrasting fill
                fillOpacity: 1,
              },
              offset: '25px', // Start arrows a bit into the segment
              repeat: '100px'
            }],
          });
          newPathOverlays.push(polyline);
        } else {
          toast({
            variant: "destructive",
            title: `Planning Failed for Trailer ${index + 1}`,
            description: `ID: ...${plan.vehicleId.slice(-4)}. Status: ${plan.status}.`
          });
        }
      });
      setMultiNavPathOverlays(newPathOverlays);
      if (newPathOverlays.length > 0) {
        toast({ title: "Path Calculation Complete", description: `${newPathOverlays.length} paths displayed.` });
      }

    } catch (error) {
      console.error("Error during multi-trailer path planning:", error);
      toast({ variant: "destructive", title: "Planning Error", description: "An unexpected error occurred. See console." });
    }
  }, [map, google, multiNavRequests, mapData.features, multiNavPathOverlays, toast]);

  const handleUpdateMultiNavRequest = useCallback((updatedRequest: VehicleRequest) => {
    setMultiNavRequests(currentReqs => 
        currentReqs.map(r => r.id === updatedRequest.id ? updatedRequest : r)
    );
  }, []);

  const handleRemoveMultiNavRequest = useCallback((requestId: string) => {
    setMultiNavRequests(currentReqs => currentReqs.filter(r => r.id !== requestId));
    // Potentially remove associated S/E markers here if you track them per request
    toast({ title: "Request Removed" });
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
          isMultiNavModeActive={drawingMode === 'MULTI_NAVIGATE'}
          multiNavRequests={multiNavRequests}
          currentMultiNavStepInfo={currentMultiNavStep}
          onCalculateMultiNav={handleCalculateMultiTrailerPaths}
          onClearMultiNav={clearAllMultiNavData}
          onUpdateMultiNavRequest={handleUpdateMultiNavRequest}
          onRemoveMultiNavRequest={handleRemoveMultiNavRequest}
          multiNavRequestsCount={multiNavRequests.length}
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