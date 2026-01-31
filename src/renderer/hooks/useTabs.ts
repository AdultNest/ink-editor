/**
 * useTabs hook for tab state management
 *
 * Provides:
 * - State management for open tabs
 * - Tab operations (open, close, select, pin)
 * - Active tab tracking
 * - Tab limit enforcement with auto-closing oldest unpinned tabs
 */

import { useState, useCallback, useMemo } from 'react';
import {
  type TabId,
  type TabData,
  type TabConfig,
  DEFAULT_TAB_CONFIG,
  createTabFromPath,
  findTabById,
  findTabByPath,
  setActiveTab,
  addTab,
  removeTab,
  updateTab,
  getActiveTab,
  moveTab,
  closeOtherTabsRespectPinned,
  closeTabsToRightRespectPinned,
  closeTabsToLeft,
  closeAllTabsRespectPinned,
  closeUnpinnedTabs,
} from '../components/TabBar/types';

/**
 * State returned by the useTabs hook
 */
export interface UseTabsState {
  /** Array of all open tabs */
  tabs: TabData[];
  /** ID of the currently active tab */
  activeTabId: TabId | null;
  /** The currently active tab data */
  activeTab: TabData | undefined;
  /** Number of open tabs */
  tabCount: number;
}

/**
 * Actions returned by the useTabs hook
 */
export interface UseTabsActions {
  /** Open a file in a new tab (or activate existing tab if already open) */
  openTab: (filePath: string) => void;
  /** Close a tab by its ID */
  closeTab: (tabId: TabId) => void;
  /** Select/activate a tab by its ID */
  selectTab: (tabId: TabId) => void;
  /** Toggle the pinned state of a tab */
  togglePin: (tabId: TabId) => void;
  /** Mark a tab as dirty (has unsaved changes) */
  setDirty: (tabId: TabId, isDirty: boolean) => void;
  /** Move a tab from one position to another */
  moveTab: (fromIndex: number, toIndex: number) => void;
  /** Close all tabs except the specified one (respects pinned tabs) */
  closeOtherTabs: (tabId: TabId) => void;
  /** Close all tabs to the right of the specified tab (respects pinned tabs) */
  closeTabsToRight: (tabId: TabId) => void;
  /** Close all tabs to the left of the specified tab (respects pinned tabs) */
  closeTabsToLeft: (tabId: TabId) => void;
  /** Close all unpinned tabs */
  closeUnpinnedTabs: () => void;
  /** Close all tabs (respects pinned tabs) */
  closeAllTabs: () => void;
  /** Check if a file is already open in a tab */
  isFileOpen: (filePath: string) => boolean;
  /** Get tab by file path */
  getTabByPath: (filePath: string) => TabData | undefined;
}

/**
 * Options for configuring the useTabs hook
 */
export interface UseTabsOptions {
  /** Initial tabs to open */
  initialTabs?: TabData[];
  /** Tab configuration settings */
  config?: Partial<TabConfig>;
  /** Callback when active tab changes */
  onActiveTabChange?: (tab: TabData | undefined) => void;
  /** Callback before tab is closed (return false to prevent closing) */
  onBeforeTabClose?: (tab: TabData) => boolean;
  /** Callback when tab is closed */
  onTabClose?: (tab: TabData) => void;
}

/**
 * Return type of the useTabs hook
 */
export type UseTabsReturn = UseTabsState & UseTabsActions;

/**
 * useTabs hook
 *
 * Manages tab state for the tab bar component.
 * Handles opening, closing, selecting, and pinning tabs.
 *
 * @param options - Optional configuration for the hook
 * @returns Tab state and actions
 *
 * @example
 * ```tsx
 * function EditorTabs() {
 *   const {
 *     tabs,
 *     activeTabId,
 *     openTab,
 *     closeTab,
 *     selectTab,
 *   } = useTabs();
 *
 *   return (
 *     <TabBar
 *       tabs={tabs}
 *       activeTabId={activeTabId}
 *       onTabSelect={selectTab}
 *       onTabClose={closeTab}
 *     />
 *   );
 * }
 * ```
 */
export function useTabs(options: UseTabsOptions = {}): UseTabsReturn {
  const {
    initialTabs = [],
    config: configOverrides,
    onActiveTabChange,
    onBeforeTabClose,
    onTabClose,
  } = options;

  // Merge default config with overrides
  const config: TabConfig = useMemo(
    () => ({ ...DEFAULT_TAB_CONFIG, ...configOverrides }),
    [configOverrides]
  );

  // State
  const [tabs, setTabs] = useState<TabData[]>(initialTabs);

  // Derived state
  const activeTab = useMemo(() => getActiveTab(tabs), [tabs]);
  const activeTabId = activeTab?.id ?? null;
  const tabCount = tabs.length;

  /**
   * Helper to enforce tab limit by closing oldest unpinned tabs
   */
  const enforceTabLimit = useCallback(
    (currentTabs: TabData[]): TabData[] => {
      const { maxTabs } = config;

      if (currentTabs.length <= maxTabs) {
        return currentTabs;
      }

      // Find unpinned tabs (excluding the active tab)
      const unpinnedTabIndices: number[] = [];
      currentTabs.forEach((tab, index) => {
        if (!tab.isPinned && !tab.isActive) {
          unpinnedTabIndices.push(index);
        }
      });

      // Remove oldest unpinned tabs until we're under the limit
      const tabsToRemove = currentTabs.length - maxTabs;
      const indicesToRemove = unpinnedTabIndices.slice(0, tabsToRemove);

      // Remove from highest index to lowest to avoid index shifting issues
      let result = [...currentTabs];
      for (const index of indicesToRemove.sort((a, b) => b - a)) {
        const tabToRemove = result[index];
        if (tabToRemove && onTabClose) {
          onTabClose(tabToRemove);
        }
        result = result.filter((_, i) => i !== index);
      }

      return result;
    },
    [config, onTabClose]
  );

  /**
   * Open a file in a new tab (or activate existing tab if already open)
   */
  const openTabAction = useCallback(
    (filePath: string): void => {
      setTabs((currentTabs) => {
        // Check if tab already exists
        const existingTab = findTabByPath(currentTabs, filePath);
        if (existingTab) {
          // Activate existing tab
          const newTabs = setActiveTab(currentTabs, existingTab.id);
          const newActiveTab = getActiveTab(newTabs);
          if (onActiveTabChange && newActiveTab?.id !== activeTabId) {
            onActiveTabChange(newActiveTab);
          }
          return newTabs;
        }

        // Add new tab
        let newTabs = addTab(currentTabs, filePath);

        // Enforce tab limit
        newTabs = enforceTabLimit(newTabs);

        // Notify about active tab change
        const newActiveTab = getActiveTab(newTabs);
        if (onActiveTabChange) {
          onActiveTabChange(newActiveTab);
        }

        return newTabs;
      });
    },
    [activeTabId, enforceTabLimit, onActiveTabChange]
  );

  /**
   * Close a tab by its ID
   */
  const closeTabAction = useCallback(
    (tabId: TabId): void => {
      setTabs((currentTabs) => {
        const tabToClose = findTabById(currentTabs, tabId);
        if (!tabToClose) {
          return currentTabs;
        }

        // Check if closing is allowed
        if (onBeforeTabClose && !onBeforeTabClose(tabToClose)) {
          return currentTabs;
        }

        // Remove the tab
        const newTabs = removeTab(currentTabs, tabId);

        // Notify callbacks
        if (onTabClose) {
          onTabClose(tabToClose);
        }

        // Notify about active tab change if needed
        const newActiveTab = getActiveTab(newTabs);
        if (onActiveTabChange && newActiveTab?.id !== tabToClose.id) {
          onActiveTabChange(newActiveTab);
        }

        return newTabs;
      });
    },
    [onBeforeTabClose, onTabClose, onActiveTabChange]
  );

  /**
   * Select/activate a tab by its ID
   */
  const selectTabAction = useCallback(
    (tabId: TabId): void => {
      setTabs((currentTabs) => {
        const tab = findTabById(currentTabs, tabId);
        if (!tab || tab.isActive) {
          return currentTabs;
        }

        const newTabs = setActiveTab(currentTabs, tabId);

        // Notify about active tab change
        if (onActiveTabChange) {
          onActiveTabChange(tab);
        }

        return newTabs;
      });
    },
    [onActiveTabChange]
  );

  /**
   * Toggle the pinned state of a tab
   */
  const togglePinAction = useCallback((tabId: TabId): void => {
    setTabs((currentTabs) => {
      const tab = findTabById(currentTabs, tabId);
      if (!tab) {
        return currentTabs;
      }

      return updateTab(currentTabs, tabId, { isPinned: !tab.isPinned });
    });
  }, []);

  /**
   * Mark a tab as dirty (has unsaved changes)
   */
  const setDirtyAction = useCallback(
    (tabId: TabId, isDirty: boolean): void => {
      setTabs((currentTabs) => updateTab(currentTabs, tabId, { isDirty }));
    },
    []
  );

  /**
   * Move a tab from one position to another
   */
  const moveTabAction = useCallback(
    (fromIndex: number, toIndex: number): void => {
      setTabs((currentTabs) => moveTab(currentTabs, fromIndex, toIndex));
    },
    []
  );

  /**
   * Close all tabs except the specified one (respects pinned tabs)
   */
  const closeOtherTabsAction = useCallback(
    (tabId: TabId): void => {
      setTabs((currentTabs) => {
        // Only close unpinned tabs that aren't the target tab
        const tabsToClose = currentTabs.filter((tab) => tab.id !== tabId && !tab.isPinned);

        // Check if any tabs should not be closed
        for (const tab of tabsToClose) {
          if (onBeforeTabClose && !onBeforeTabClose(tab)) {
            // If any tab can't be closed, abort the operation
            return currentTabs;
          }
        }

        const newTabs = closeOtherTabsRespectPinned(currentTabs, tabId);

        // Notify about closed tabs
        if (onTabClose) {
          for (const tab of tabsToClose) {
            onTabClose(tab);
          }
        }

        // Notify about active tab change
        const newActiveTab = getActiveTab(newTabs);
        if (onActiveTabChange) {
          onActiveTabChange(newActiveTab);
        }

        return newTabs;
      });
    },
    [onBeforeTabClose, onTabClose, onActiveTabChange]
  );

  /**
   * Close all tabs to the right of the specified tab (respects pinned tabs)
   */
  const closeTabsToRightAction = useCallback(
    (tabId: TabId): void => {
      setTabs((currentTabs) => {
        const tabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
        if (tabIndex === -1) {
          return currentTabs;
        }

        // Only close unpinned tabs to the right
        const tabsToClose = currentTabs.slice(tabIndex + 1).filter((tab) => !tab.isPinned);

        // Check if any tabs should not be closed
        for (const tab of tabsToClose) {
          if (onBeforeTabClose && !onBeforeTabClose(tab)) {
            return currentTabs;
          }
        }

        const newTabs = closeTabsToRightRespectPinned(currentTabs, tabId);

        // Notify about closed tabs
        if (onTabClose) {
          for (const tab of tabsToClose) {
            onTabClose(tab);
          }
        }

        // Notify about active tab change
        const newActiveTab = getActiveTab(newTabs);
        if (onActiveTabChange) {
          onActiveTabChange(newActiveTab);
        }

        return newTabs;
      });
    },
    [onBeforeTabClose, onTabClose, onActiveTabChange]
  );

  /**
   * Close all tabs to the left of the specified tab (respects pinned tabs)
   */
  const closeTabsToLeftAction = useCallback(
    (tabId: TabId): void => {
      setTabs((currentTabs) => {
        const tabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
        if (tabIndex === -1) {
          return currentTabs;
        }

        // Only close unpinned tabs to the left
        const tabsToClose = currentTabs.slice(0, tabIndex).filter((tab) => !tab.isPinned);

        // Check if any tabs should not be closed
        for (const tab of tabsToClose) {
          if (onBeforeTabClose && !onBeforeTabClose(tab)) {
            return currentTabs;
          }
        }

        const newTabs = closeTabsToLeft(currentTabs, tabId);

        // Notify about closed tabs
        if (onTabClose) {
          for (const tab of tabsToClose) {
            onTabClose(tab);
          }
        }

        // Notify about active tab change
        const newActiveTab = getActiveTab(newTabs);
        if (onActiveTabChange) {
          onActiveTabChange(newActiveTab);
        }

        return newTabs;
      });
    },
    [onBeforeTabClose, onTabClose, onActiveTabChange]
  );

  /**
   * Close all unpinned tabs
   */
  const closeUnpinnedTabsAction = useCallback((): void => {
    setTabs((currentTabs) => {
      const unpinnedTabs = currentTabs.filter((tab) => !tab.isPinned);

      // Check if any tabs should not be closed
      for (const tab of unpinnedTabs) {
        if (onBeforeTabClose && !onBeforeTabClose(tab)) {
          return currentTabs;
        }
      }

      const newTabs = closeUnpinnedTabs(currentTabs);

      // Notify about closed tabs
      if (onTabClose) {
        for (const tab of unpinnedTabs) {
          onTabClose(tab);
        }
      }

      // Notify about active tab change
      const newActiveTab = getActiveTab(newTabs);
      if (onActiveTabChange) {
        onActiveTabChange(newActiveTab);
      }

      return newTabs;
    });
  }, [onBeforeTabClose, onTabClose, onActiveTabChange]);

  /**
   * Close all tabs (respects pinned tabs)
   */
  const closeAllTabsAction = useCallback((): void => {
    setTabs((currentTabs) => {
      // Only close unpinned tabs
      const tabsToClose = currentTabs.filter((tab) => !tab.isPinned);

      // Check if any tabs should not be closed
      for (const tab of tabsToClose) {
        if (onBeforeTabClose && !onBeforeTabClose(tab)) {
          return currentTabs;
        }
      }

      const newTabs = closeAllTabsRespectPinned(currentTabs);

      // Notify about closed tabs
      if (onTabClose) {
        for (const tab of tabsToClose) {
          onTabClose(tab);
        }
      }

      // Notify about active tab change
      const newActiveTab = getActiveTab(newTabs);
      if (onActiveTabChange) {
        onActiveTabChange(newActiveTab);
      }

      return newTabs;
    });
  }, [onBeforeTabClose, onTabClose, onActiveTabChange]);

  /**
   * Check if a file is already open in a tab
   */
  const isFileOpenAction = useCallback(
    (filePath: string): boolean => {
      return findTabByPath(tabs, filePath) !== undefined;
    },
    [tabs]
  );

  /**
   * Get tab by file path
   */
  const getTabByPathAction = useCallback(
    (filePath: string): TabData | undefined => {
      return findTabByPath(tabs, filePath);
    },
    [tabs]
  );

  return {
    // State
    tabs,
    activeTabId,
    activeTab,
    tabCount,
    // Actions
    openTab: openTabAction,
    closeTab: closeTabAction,
    selectTab: selectTabAction,
    togglePin: togglePinAction,
    setDirty: setDirtyAction,
    moveTab: moveTabAction,
    closeOtherTabs: closeOtherTabsAction,
    closeTabsToRight: closeTabsToRightAction,
    closeTabsToLeft: closeTabsToLeftAction,
    closeUnpinnedTabs: closeUnpinnedTabsAction,
    closeAllTabs: closeAllTabsAction,
    isFileOpen: isFileOpenAction,
    getTabByPath: getTabByPathAction,
  };
}

export default useTabs;
