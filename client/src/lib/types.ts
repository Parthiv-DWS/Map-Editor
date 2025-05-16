export type LatLng = {
  lat: number;
  lng: number;
};

export type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type DrawingMode = 
  | 'SELECT'
  | 'ROAD'
  | 'MARKER'
  | 'POLYGON'
  | 'ERASE'
  | 'BLOCK'
  | 'NAVIGATE'
  | 'VIBRATE';

export type RoadStyle = {
  color: string;
  width: number;
  blockStyle: 'dashed' | 'solid' | 'highlight';
};

export type MapFeature = {
  id: string;
  type: 'road' | 'marker' | 'polygon' | 'blocked';
  path?: LatLng[];
  position?: LatLng;
  properties: {
    color: string;
    width?: number;
    isBlocked?: boolean;
    blockStyle?: string;
    name?: string;
  };
};

export type MapData = {
  features: MapFeature[];
  bounds: Bounds;
  lastModified: number;
};
