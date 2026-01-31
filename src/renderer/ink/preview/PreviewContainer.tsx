/**
 * PreviewContainer Component
 *
 * Chat-like scrollable container for preview items.
 */

import { useRef, useEffect } from 'react';
import type { PreviewContainerProps } from './types';
import './Preview.css';

export function PreviewContainer({
  children,
  autoScroll = false,
  className = '',
}: PreviewContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [children, autoScroll]);

  const classNames = ['preview-container', className].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={classNames}>
      {children}
    </div>
  );
}

export default PreviewContainer;
