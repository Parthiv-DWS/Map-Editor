import localforage from 'localforage';
import { MapData, MapFeature } from './types';

// Initialize localforage
localforage.config({
  name: 'InteractiveMapEditor',
  storeName: 'mapData',
});

export const DEFAULT_BOUNDS = {
  north: 23.092391,
  south: 23.081791,
  east: 72.46792,
  west: 72.45392,
};

export const DEFAULT_MAP_DATA: MapData = {
  features: [],
  bounds: DEFAULT_BOUNDS,
  lastModified: Date.now(),
};

export const saveMapData = async (data: MapData): Promise<boolean> => {
  try {
    await localforage.setItem('mapData', data);
    return true;
  } catch (error) {
    console.error('Error saving map data:', error);
    return false;
  }
};

export const getMapData = async (): Promise<MapData> => {
  try {
    const data = await localforage.getItem<MapData>('mapData');
    return data || DEFAULT_MAP_DATA;
  } catch (error) {
    console.error('Error loading map data:', error);
    return DEFAULT_MAP_DATA;
  }
};

export const clearMapData = async (): Promise<boolean> => {
  try {
    await localforage.removeItem('mapData');
    return true;
  } catch (error) {
    console.error('Error clearing map data:', error);
    return false;
  }
};

export const exportMapData = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    getMapData()
      .then((data) => {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        resolve(jsonStr);
      })
      .catch(reject);
  });
};

export const importMapData = (file: File): Promise<MapData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        if (!e.target?.result) {
          throw new Error('Failed to read file');
        }
        
        const data = JSON.parse(e.target.result as string) as MapData;
        
        // Validate the data structure
        if (!data.features || !data.bounds) {
          throw new Error('Invalid map data format');
        }
        
        await saveMapData(data);
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
    
    reader.readAsText(file);
  });
};
