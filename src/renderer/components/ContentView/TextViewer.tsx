/**
 * TextViewer component
 *
 * Displays text file content in a read-only view.
 * Used for non-ink files like .txt, .md, .json, etc.
 */

import { useState, useEffect } from 'react';
import './ContentView.css';

export interface TextViewerProps {
  /** The file path to load content from */
  filePath: string;
  /** The file name to display */
  fileName: string;
}

/**
 * TextViewer renders the content of a text file
 */
export function TextViewer({ filePath, fileName }: TextViewerProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const fileContent = await window.electronAPI.readFile(filePath);
        if (isMounted) {
          setContent(fileContent);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Failed to load file';
          setError(message);
          setIsLoading(false);
        }
      }
    }

    loadFile();

    return () => {
      isMounted = false;
    };
  }, [filePath]);

  if (isLoading) {
    return (
      <div className="content-view content-view-loading">
        <div className="content-view-spinner" />
        <span>Loading {fileName}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-view content-view-error">
        <span className="content-view-error-icon">!</span>
        <span className="content-view-error-message">{error}</span>
      </div>
    );
  }

  return (
    <div className="content-view text-viewer">
      <pre className="text-viewer-content">{content}</pre>
    </div>
  );
}

export default TextViewer;
