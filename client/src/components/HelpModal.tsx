import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function HelpModal() {
  const [open, setOpen] = useState(false);
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-gray-500 hover:text-gray-700 flex items-center">
          <span className="material-icons mr-1">help_outline</span>
          <span className="hidden md:inline">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-800">How to Use the Map Editor</DialogTitle>
          <DialogDescription>
            Learn the basic operations of the interactive map editor
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <h3 className="font-medium text-lg mb-2">Drawing Tools</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li><strong>Select:</strong> Choose and edit existing elements on the map</li>
              <li><strong>Add Road:</strong> Draw new roads by clicking to add points</li>
              <li><strong>Add Marker:</strong> Place markers at specific locations</li>
              <li><strong>Add Area:</strong> Create polygons to define areas</li>
              <li><strong>Delete:</strong> Remove selected elements from the map</li>
              <li><strong>Block Road:</strong> Mark existing roads as blocked or unusable</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-lg mb-2">Map Bounds</h3>
            <p className="text-gray-700">The map is restricted to the specified latitude and longitude boundaries. All drawing operations are limited to this area.</p>
          </div>
          <div>
            <h3 className="font-medium text-lg mb-2">Saving Your Work</h3>
            <p className="text-gray-700">All changes are stored locally in your browser. Use the Export button to save your work as a file, and Import to restore previously saved maps.</p>
          </div>
          <div>
            <h3 className="font-medium text-lg mb-2">Important Notes</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>Changes are not sent to Google Maps</li>
              <li>Your modifications are only visible to you</li>
              <li>Use the Reset button to clear all changes</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
