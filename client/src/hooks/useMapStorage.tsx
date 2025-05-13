import { useState, useEffect, useCallback } from 'react';
import { MapData, MapFeature } from '@/lib/types';
import { 
  getMapData, 
  saveMapData, 
  clearMapData, 
  exportMapData, 
  importMapData,
  DEFAULT_MAP_DATA
} from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';

export default function useMapStorage() {
  const [mapData, setMapData] = useState<MapData>(DEFAULT_MAP_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const data = await getMapData();
        setMapData(data);
      } catch (error) {
        console.error('Failed to load map data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load map data',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [toast]);

  // Save data
  const saveData = useCallback(async (data: MapData) => {
    try {
      setIsLoading(true);
      const updated = {
        ...data,
        lastModified: Date.now(),
      };
      await saveMapData(updated);
      setMapData(updated);
      return true;
    } catch (error) {
      console.error('Failed to save map data:', error);
      toast({
        title: 'Error',
        description: 'Failed to save map data',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Update features
  const updateFeatures = useCallback(async (features: MapFeature[]) => {
    return saveData({ ...mapData, features });
  }, [mapData, saveData]);

  // Add feature
  const addFeature = useCallback(async (feature: MapFeature) => {
    return updateFeatures([...mapData.features, feature]);
  }, [mapData, updateFeatures]);

  // Update feature
  const updateFeature = useCallback(async (updatedFeature: MapFeature) => {
    const features = mapData.features.map(feature => 
      feature.id === updatedFeature.id ? updatedFeature : feature
    );
    return updateFeatures(features);
  }, [mapData, updateFeatures]);

  // Delete feature
  const deleteFeature = useCallback(async (featureId: string) => {
    const features = mapData.features.filter(feature => feature.id !== featureId);
    return updateFeatures(features);
  }, [mapData, updateFeatures]);

  // Clear all data
  const clearData = useCallback(async () => {
    try {
      setIsLoading(true);
      await clearMapData();
      setMapData(DEFAULT_MAP_DATA);
      toast({
        title: 'Reset Complete',
        description: 'All map changes have been removed',
      });
      return true;
    } catch (error) {
      console.error('Failed to clear map data:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear map data',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Update bounds
  const updateBounds = useCallback(async (bounds: google.maps.LatLngBounds) => {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    
    const newBounds = {
      north: ne.lat(),
      east: ne.lng(),
      south: sw.lat(),
      west: sw.lng(),
    };
    
    return saveData({ ...mapData, bounds: newBounds });
  }, [mapData, saveData]);

  // Export data
  const exportData = useCallback(async () => {
    try {
      await exportMapData();
      toast({
        title: 'Export Successful',
        description: 'Map data has been exported to a file',
      });
      return true;
    } catch (error) {
      console.error('Failed to export map data:', error);
      toast({
        title: 'Error',
        description: 'Failed to export map data',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Import data
  const importData = useCallback(async (file: File) => {
    try {
      setIsLoading(true);
      const data = await importMapData(file);
      setMapData(data);
      toast({
        title: 'Import Successful',
        description: 'Map data has been imported',
      });
      return true;
    } catch (error) {
      console.error('Failed to import map data:', error);
      toast({
        title: 'Error',
        description: 'Failed to import map data',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return {
    mapData,
    isLoading,
    addFeature,
    updateFeature,
    deleteFeature,
    clearData,
    updateBounds,
    exportData,
    importData,
  };
}
