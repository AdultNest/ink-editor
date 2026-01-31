/**
 * AudioViewer component
 *
 * Plays audio files with native HTML5 audio controls.
 */

import { useState } from 'react';
import './ContentView.css';

export interface AudioViewerProps {
  /** The file path to the audio file */
  filePath: string;
  /** The file name to display */
  fileName: string;
}

/**
 * Gets the MIME type for an audio file based on extension
 */
function getAudioMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
  };
  return mimeTypes[ext || ''] || 'audio/mpeg';
}

/**
 * AudioViewer renders an audio player with native controls
 */
export function AudioViewer({ filePath, fileName }: AudioViewerProps) {
  const [error, setError] = useState<string | null>(null);

  const handleError = () => {
    setError(`Failed to load audio: ${fileName}. The format may not be supported.`);
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
    <div className="content-view audio-viewer">
      <div className="audio-viewer-toolbar">
        <span className="audio-viewer-filename">{fileName}</span>
      </div>
      <div className="audio-viewer-container">
        <span className="audio-viewer-icon">🎵</span>
        <audio controls className="audio-viewer-audio" onError={handleError}>
          <source
            src={window.electronAPI.getLocalFileUrl(filePath)}
            type={getAudioMimeType(fileName)}
          />
          Your browser does not support audio playback.
        </audio>
      </div>
    </div>
  );
}

export default AudioViewer;
