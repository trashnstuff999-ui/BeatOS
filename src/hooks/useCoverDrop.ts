// src/hooks/useCoverDrop.ts
// ═══════════════════════════════════════════════════════════════════════════════
// BeatOS — Cover Image Drag & Drop Hook
// Handles drag events and file drops for cover images
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, DragEvent } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseCoverDropOptions {
  /** Whether drag & drop is enabled */
  enabled: boolean;
  /** Callback when an image is dropped (receives data URL) */
  onImageDrop?: (dataUrl: string) => void;
}

interface UseCoverDropReturn {
  /** Whether user is currently dragging over the drop zone */
  isDragging: boolean;
  /** The dropped image as data URL (for backwards compatibility) */
  coverImage: string | null;
  /** Props to spread on the drop zone element */
  dropZoneProps: {
    onDragEnter: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  /** Clear the current cover image */
  clearCover: () => void;
  /** Set cover image manually */
  setCoverImage: (url: string | null) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCoverDrop(options: UseCoverDropOptions): UseCoverDropReturn {
  const { enabled, onImageDrop } = options;
  
  const [isDragging, setIsDragging] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [dragCounter, setDragCounter] = useState(0);

  // ─── Drag Handlers ─────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!enabled) return;
    
    setDragCounter(prev => prev + 1);
    
    // Check if dragging files (not text etc.)
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, [enabled]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!enabled) return;
    
    // Set drag effect
    e.dataTransfer.dropEffect = "copy";
  }, [enabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!enabled) return;
    
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, [enabled]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    setDragCounter(0);
    
    if (!enabled) return;
    
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith("image/"));
    
    if (!imageFile) {
      console.warn("Dropped file is not an image");
      return;
    }
    
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (imageFile.size > maxSize) {
      console.warn("Image file too large (max 10MB)");
      return;
    }
    
    // Read file as data URL
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCoverImage(dataUrl);
      
      // Call callback if provided
      if (onImageDrop) {
        onImageDrop(dataUrl);
      }
    };
    reader.onerror = () => {
      console.error("Failed to read image file");
    };
    reader.readAsDataURL(imageFile);
  }, [enabled, onImageDrop]);

  // ─── Clear Cover ───────────────────────────────────────────────────────────

  const clearCover = useCallback(() => {
    setCoverImage(null);
  }, []);

  // ─── Return ────────────────────────────────────────────────────────────────

  return {
    isDragging,
    coverImage,
    dropZoneProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    clearCover,
    setCoverImage,
  };
}

export default useCoverDrop;