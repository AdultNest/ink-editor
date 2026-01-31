import { useState, useCallback, useEffect, type ReactNode, type MouseEvent } from 'react';

/**
 * Props for the OpenFolderButton component
 */
export interface OpenFolderButtonProps {
  /** Callback invoked when the button is clicked. Should handle folder opening logic. */
  onClick?: () => void | Promise<unknown>;
  /** Custom label for the button */
  label?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
}

/**
 * OpenFolderButton component
 *
 * A button that triggers the native folder selection dialog.
 * Can be used in the sidebar header to allow users to open a project folder.
 *
 * @example
 * ```tsx
 * // With useFileTree hook
 * const { openFolder } = useFileTree();
 * <OpenFolderButton onClick={openFolder} />
 *
 * // Standalone usage (calls IPC directly)
 * <OpenFolderButton />
 * ```
 */
export function OpenFolderButton({
  onClick,
  label = 'Open Folder',
  disabled = false,
}: OpenFolderButtonProps) {
  const handleClick = useCallback(async () => {
    if (onClick) {
      await onClick();
    } else {
      // Default behavior: call IPC directly
      await window.electronAPI.openFolder();
    }
  }, [onClick]);

  return (
    <button
      type="button"
      className="open-folder-button"
      onClick={handleClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <span className="open-folder-button__icon" aria-hidden="true">
        📂
      </span>
    </button>
  );
}

export interface SidebarProps {
  /** Content to render in the sidebar (e.g., FileTree component) */
  children?: ReactNode;
  /** Title displayed in the sidebar header (e.g., "EXPLORER") */
  title?: string;
  /** Actions to render in the sidebar header (e.g., Open Folder button) */
  headerActions?: ReactNode;
  /** Default width of the sidebar in pixels */
  defaultWidth?: number;
  /** Minimum width the sidebar can be resized to */
  minWidth?: number;
  /** Maximum width the sidebar can be resized to */
  maxWidth?: number;
  /** Callback when sidebar width changes during resize */
  onWidthChange?: (width: number) => void;
}

const DEFAULT_WIDTH = 250;
const MIN_WIDTH = 150;
const MAX_WIDTH = 500;

function Sidebar({
  children,
  title,
  headerActions,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  onWidthChange,
}: SidebarProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: globalThis.MouseEvent) => {
      if (!isResizing) return;

      const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
      setWidth(newWidth);
      onWidthChange?.(newWidth);
    },
    [isResizing, minWidth, maxWidth, onWidthChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const showHeader = title || headerActions;

  return (
    <div className="sidebar" style={{ width }}>
      {showHeader && (
        <div className="sidebar-header">
          {title && <span className="sidebar-header__title">{title}</span>}
          {headerActions && (
            <div className="sidebar-header__actions">{headerActions}</div>
          )}
        </div>
      )}
      <div className="sidebar-content">
        {children}
      </div>
      <div
        className={`sidebar-resize-handle ${isResizing ? 'sidebar-resize-handle--active' : ''}`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
      />
    </div>
  );
}

export default Sidebar;
