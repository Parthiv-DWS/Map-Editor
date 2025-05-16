import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bounds, DrawingMode, RoadStyle } from '@/lib/types';

interface ToolItem {
  id: DrawingMode;
  icon: string;
  label: string;
}

const tools: ToolItem[] = [
  { id: 'SELECT', icon: 'pan_tool', label: 'Select' },
  { id: 'ROAD', icon: 'timeline', label: 'Add Road' },
  { id: 'MARKER', icon: 'place', label: 'Add Marker' },
  { id: 'POLYGON', icon: 'category', label: 'Add Area' },
  { id: 'ERASE', icon: 'delete', label: 'Delete' },
  { id: 'BLOCK', icon: 'block', label: 'Block Road' },
  { id: 'NAVIGATE', icon: 'directions', label: 'Navigate' },
  { id: 'VIBRATE', icon: 'vibrate', label: 'Vibrate' },
];

interface SidebarPanelProps {
  drawingMode: DrawingMode;
  onModeChange: (mode: DrawingMode) => void;
  bounds: Bounds;
  onBoundsChange: (bounds: Bounds) => void;
  onApplyBounds: (bounds: Bounds) => void;
  roadStyle: RoadStyle;
  onRoadStyleChange: (style: Partial<RoadStyle>) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  isVisible: boolean;
  onToggle: () => void;
}

export default function SidebarPanel({
  drawingMode,
  onModeChange,
  bounds,
  onBoundsChange,
  onApplyBounds,
  roadStyle,
  onRoadStyleChange,
  onExport,
  onImport,
  isVisible,
  onToggle,
}: SidebarPanelProps) {
  const [tempBounds, setTempBounds] = useState<Bounds>(bounds);
  
  const handleBoundsChange = (key: keyof Bounds, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setTempBounds(prev => ({ ...prev, [key]: numValue }));
    }
  };
  
  const handleApplyBounds = () => {
    onBoundsChange(tempBounds);
    onApplyBounds(tempBounds);
  };
  
  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        onImport(file);
      }
    };
    input.click();
  };
  
  return (
    <div 
      className={`sidebar bg-white shadow-md w-72 flex flex-col z-10 border-r border-gray-200 md:relative absolute transition-all duration-300 ease-in-out 
        ${!isVisible ? '-translate-x-full' : 'translate-x-0'}`}
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-gray-800">Drawing Tools</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden text-gray-500 hover:text-gray-700"
            onClick={onToggle}
          >
            <span className="material-icons">chevron_left</span>
          </Button>
        </div>
      </div>
      
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-500 mb-3">TOOL SELECTION</h3>
        <div className="grid grid-cols-2 gap-2">
          {tools.map((tool) => (
            <Button
              key={tool.id}
              variant="outline"
              className={`tool-item flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition h-auto ${
                drawingMode === tool.id ? 'active' : ''
              }`}
              onClick={() => onModeChange(tool.id)}
            >
              <span className="material-icons mb-1">{tool.icon}</span>
              <span className="text-xs">{tool.label}</span>
            </Button>
          ))}
        </div>
      </div>
      
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-500 mb-3">MAP BOUNDS</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500 block mb-1">North-East Bound</Label>
            <div className="flex space-x-2">
              <div className="flex-1">
                <Input 
                  type="text" 
                  value={tempBounds.north.toString()}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded" 
                  placeholder="Lat" 
                  onChange={(e) => handleBoundsChange('north', e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input 
                  type="text" 
                  value={tempBounds.east.toString()} 
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded" 
                  placeholder="Lng" 
                  onChange={(e) => handleBoundsChange('east', e.target.value)}
                />
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500 block mb-1">South-West Bound</Label>
            <div className="flex space-x-2">
              <div className="flex-1">
                <Input 
                  type="text" 
                  value={tempBounds.south.toString()} 
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded" 
                  placeholder="Lat" 
                  onChange={(e) => handleBoundsChange('south', e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input 
                  type="text" 
                  value={tempBounds.west.toString()} 
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded" 
                  placeholder="Lng" 
                  onChange={(e) => handleBoundsChange('west', e.target.value)}
                />
              </div>
            </div>
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleApplyBounds}
          >
            Apply Bounds
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-500 mb-3">STYLING OPTIONS</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500 block mb-1">Road Color</Label>
            <div className="flex items-center space-x-2">
              <Input 
                type="color" 
                value={roadStyle.color} 
                className="w-8 h-8 rounded border border-gray-200 p-0" 
                onChange={(e) => onRoadStyleChange({ color: e.target.value })}
              />
              <Input 
                type="text" 
                value={roadStyle.color} 
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded" 
                onChange={(e) => onRoadStyleChange({ color: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500 block mb-1">
              Road Width: {roadStyle.width}px
            </Label>
            <div className="flex items-center space-x-2">
              <Slider
                min={1}
                max={10}
                step={1}
                value={[roadStyle.width]}
                onValueChange={(values) => onRoadStyleChange({ width: values[0] })}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500 block mb-1">Blocked Road Style</Label>
            <Select 
              value={roadStyle.blockStyle} 
              onValueChange={(value) => onRoadStyleChange({ blockStyle: value as 'dashed' | 'solid' | 'highlight' })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dashed">Dashed Line</SelectItem>
                <SelectItem value="solid">Solid Line</SelectItem>
                <SelectItem value="highlight">Highlight</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <div className="mt-auto p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-2">All changes are stored locally</div>
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onExport}
          >
            Export
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleImportClick}
          >
            Import
          </Button>
        </div>
      </div>
    </div>
  );
}
