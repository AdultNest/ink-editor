/**
 * ImageViewer component
 *
 * Displays image files with zoom and pan controls.
 */

import { useState } from 'react';
import './ContentView.css';

export interface ImageViewerProps {
  /** The file path to the image */
  filePath: string;
  /** The file name to display */
  fileName: string;
}

/**
 * ImageViewer renders an image file with basic controls
 */
export function ImageViewer({ filePath, fileName }: ImageViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setError(`Failed to load image: ${fileName}`);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  if (error) {
    return (
      <div className="content-view content-view-error">
        <span className="content-view-error-icon">!</span>
        <span className="content-view-error-message">{error}</span>
      </div>
    );
  }

  return (
    <div className="content-view image-viewer">
      <div className="image-viewer-toolbar">
        <button
          className="image-viewer-btn"
          onClick={handleZoomOut}
          title="Zoom out"
          disabled={zoom <= 0.25}
        >
          -
        </button>
        <span className="image-viewer-zoom-level">{Math.round(zoom * 100)}%</span>
        <button
          className="image-viewer-btn"
          onClick={handleZoomIn}
          title="Zoom in"
          disabled={zoom >= 5}
        >
          +
        </button>
        <button
          className="image-viewer-btn"
          onClick={handleZoomReset}
          title="Reset zoom"
        >
          Reset
        </button>
        <span className="image-viewer-filename">{fileName}</span>
      </div>
      <div className="image-viewer-container">
        {isLoading && (
          <div className="image-viewer-loading">
            <div className="content-view-spinner" />
            <span>Loading image...</span>
          </div>
        )}
        <img
          src={window.electronAPI.getLocalFileUrl(filePath)}
          alt={fileName}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            transform: `scale(${zoom})`,
            display: isLoading ? 'none' : 'block',
          }}
          className="image-viewer-image"
          draggable={false}
        />
      </div>
    </div>
  );
}

export default ImageViewer;
