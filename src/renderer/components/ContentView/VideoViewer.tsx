/**
 * VideoViewer component
 *
 * Plays video files with native HTML5 video controls.
 */

import { useState, useRef } from 'react';
import './ContentView.css';

export interface VideoViewerProps {
  /** The file path to the video */
  filePath: string;
  /** The file name to display */
  fileName: string;
}

/**
 * Gets the MIME type for a video file based on extension
 */
function getVideoMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    ogv: 'video/ogg',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    m4v: 'video/mp4',
  };
  return mimeTypes[ext || ''] || 'video/mp4';
}

/**
 * VideoViewer renders a video player with native controls
 */
export function VideoViewer({ filePath, fileName }: VideoViewerProps) {
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleError = () => {
    setError(`Failed to load video: ${fileName}. The format may not be supported.`);
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
    <div className="content-view video-viewer">
      <div className="video-viewer-toolbar">
        <span className="video-viewer-filename">{fileName}</span>
      </div>
      <div className="video-viewer-container">
        <video
          ref={videoRef}
          controls
          className="video-viewer-video"
          onError={handleError}
        >
          <source
            src={window.electronAPI.getLocalFileUrl(filePath)}
            type={getVideoMimeType(fileName)}
          />
          Your browser does not support video playback.
        </video>
      </div>
    </div>
  );
}

export default VideoViewer;
