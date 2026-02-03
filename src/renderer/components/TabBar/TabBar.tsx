/**
 * TabBar container component
 *
 * Displays a horizontal list of tabs for open files with:
 * - Multi-row wrapping when tabs exceed available width
 * - Active tab highlighting
 * - Tab selection and close callbacks
 * - Empty state handling
 * - Context menu for tab operations
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import Tab from './Tab';
import type { TabBarProps, TabId, TabData } from './types';
import './TabBar.css';

/** Context menu state */
interface ContextMenuState {
  x: number;
  y: number;
  tab: TabData;
}

/**
 * TabBar component
 *
 * Renders a horizontal tab bar for managing open files.
 * Tabs wrap to additional rows when they don't fit.
 *
 * @param props - TabBarProps including tabs array and event handlers
 */
function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabPin,
  onTabSave,
  onCloseOtherTabs,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseAllTabs,
  className,
}: TabBarProps) {
  // Ref to track the active tab element for scroll-into-view
  const activeTabRef = useRef<HTMLDivElement>(null);
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  /**
   * Scroll the active tab into view when it changes
   */
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeTabId]);

  /**
   * Handle tab selection
   */
  const handleTabSelect = useCallback(
    (tabId: TabId) => {
      onTabSelect(tabId);
    },
    [onTabSelect]
  );

  /**
   * Handle tab close
   */
  const handleTabClose = useCallback(
    (tabId: TabId) => {
      onTabClose(tabId);
    },
    [onTabClose]
  );

  /**
   * Handle tab pin toggle (on double-click)
   */
  const handleTabPin = useCallback(
    (tabId: TabId) => {
      if (onTabPin) {
        onTabPin(tabId);
      }
    },
    [onTabPin]
  );

  /**
   * Handle middle-click to close tab
   */
  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, tab: TabData) => {
      // Middle mouse button is button 1
      if (e.button === 1 && !tab.isPinned) {
        e.preventDefault();
        e.stopPropagation();
        handleTabClose(tab.id);
      }
    },
    [handleTabClose]
  );

  /**
   * Handle right-click context menu on tab
   */
  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: TabData) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        tab,
      });
    },
    []
  );

  /**
   * Close the context menu
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * Handle context menu action
   */
  const handleContextMenuAction = useCallback(
    (action: string) => {
      if (!contextMenu) return;

      const { tab } = contextMenu;

      switch (action) {
        case 'close':
          onTabClose(tab.id);
          break;
        case 'closeOthers':
          onCloseOtherTabs?.(tab.id);
          break;
        case 'closeLeft':
          onCloseTabsToLeft?.(tab.id);
          break;
        case 'closeRight':
          onCloseTabsToRight?.(tab.id);
          break;
        case 'closeAll':
          onCloseAllTabs?.();
          break;
        case 'pin':
          onTabPin?.(tab.id);
          break;
        case 'save':
          onTabSave?.(tab.id);
          break;
      }

      closeContextMenu();
    },
    [contextMenu, onTabClose, onCloseOtherTabs, onCloseTabsToLeft, onCloseTabsToRight, onCloseAllTabs, onTabPin, onTabSave, closeContextMenu]
  );

  /**
   * Close context menu when clicking outside
   */
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tab-bar__context-menu')) {
        closeContextMenu();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu, closeContextMenu]);

  /**
   * Handle keyboard navigation between tabs
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (tabs.length === 0) return;

      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
      let newIndex: number | null = null;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
          break;
        case 'ArrowRight':
          e.preventDefault();
          newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = tabs.length - 1;
          break;
      }

      if (newIndex !== null && tabs[newIndex]) {
        onTabSelect(tabs[newIndex].id);
      }
    },
    [tabs, activeTabId, onTabSelect]
  );

  // Build class names
  const classNames = ['tab-bar'];
  if (className) {
    classNames.push(className);
  }
  if (tabs.length === 0) {
    classNames.push('tab-bar--empty');
  }

  // Show empty state when no tabs
  if (tabs.length === 0) {
    return (
      <div className={classNames.join(' ')} role="tablist" aria-label="Open files">
        <div className="tab-bar__empty-message">No open files</div>
      </div>
    );
  }

  // Calculate the tab index for determining left/right options
  const getTabIndex = (tabId: TabId): number => {
    return tabs.findIndex((t) => t.id === tabId);
  };

  // Check if there are unpinned tabs to the left
  const hasUnpinnedTabsToLeft = (tabId: TabId): boolean => {
    const index = getTabIndex(tabId);
    return tabs.slice(0, index).some((t) => !t.isPinned);
  };

  // Check if there are unpinned tabs to the right
  const hasUnpinnedTabsToRight = (tabId: TabId): boolean => {
    const index = getTabIndex(tabId);
    return tabs.slice(index + 1).some((t) => !t.isPinned);
  };

  // Check if there are other unpinned tabs
  const hasOtherUnpinnedTabs = (tabId: TabId): boolean => {
    return tabs.some((t) => t.id !== tabId && !t.isPinned);
  };

  // Check if there are any unpinned tabs
  const hasAnyUnpinnedTabs = (): boolean => {
    return tabs.some((t) => !t.isPinned);
  };

  return (
    <div
      className={classNames.join(' ')}
      role="tablist"
      aria-label="Open files"
      onKeyDown={handleKeyDown}
    >
      <div className="tab-bar__tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={tab.id === activeTabId ? activeTabRef : undefined}
            className="tab-bar__tab-wrapper"
            onContextMenu={(e) => handleTabContextMenu(e, tab)}
            onMouseDown={(e) => handleMiddleClick(e, tab)}
          >
            <Tab
              tab={tab}
              onSelect={handleTabSelect}
              onClose={handleTabClose}
              onDoubleClick={handleTabPin}
              onPin={onTabPin}
            />
          </div>
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="tab-bar__context-overlay" onClick={closeContextMenu} />
          <div
            className="tab-bar__context-menu"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close this tab */}
            <button
              className="tab-bar__context-item"
              onClick={() => handleContextMenuAction('close')}
            >
              Close
            </button>

            {/* Close other tabs */}
            <button
              className="tab-bar__context-item"
              onClick={() => handleContextMenuAction('closeOthers')}
              disabled={!hasOtherUnpinnedTabs(contextMenu.tab.id)}
            >
              Close Other Tabs
            </button>

            {/* Close tabs to the left */}
            <button
              className="tab-bar__context-item"
              onClick={() => handleContextMenuAction('closeLeft')}
              disabled={!hasUnpinnedTabsToLeft(contextMenu.tab.id)}
            >
              Close Tabs to the Left
            </button>

            {/* Close tabs to the right */}
            <button
              className="tab-bar__context-item"
              onClick={() => handleContextMenuAction('closeRight')}
              disabled={!hasUnpinnedTabsToRight(contextMenu.tab.id)}
            >
              Close Tabs to the Right
            </button>

            {/* Close all tabs */}
            <button
              className="tab-bar__context-item"
              onClick={() => handleContextMenuAction('closeAll')}
              disabled={!hasAnyUnpinnedTabs()}
            >
              Close All Tabs
            </button>

            {/* Divider */}
            <div className="tab-bar__context-divider" />

            {/* Pin/Unpin */}
            {onTabPin && (
              <button
                className="tab-bar__context-item"
                onClick={() => handleContextMenuAction('pin')}
              >
                {contextMenu.tab.isPinned ? 'Unpin Tab' : 'Pin Tab'}
              </button>
            )}

            {/* Save */}
            {onTabSave && contextMenu.tab.isDirty && (
              <button
                className="tab-bar__context-item"
                onClick={() => handleContextMenuAction('save')}
              >
                Save
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default TabBar;
