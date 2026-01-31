/**
 * TabBar types and utility functions
 *
 * Provides TypeScript interfaces for tab management system
 * and utility functions for tab operations.
 */

import { type FileType, getFileType, getFileIcon, getFileName } from '../FileTree/types';

/**
 * Unique identifier for a tab
 * Uses the file path as a unique identifier
 */
export type TabId = string;

/**
 * Data associated with a tab
 */
export interface TabData {
  /** Unique identifier - uses the full file path */
  id: TabId;
  /** Full absolute path to the file */
  filePath: string;
  /** Display name (file name only) */
  fileName: string;
  /** File type for icon display */
  fileType: FileType;
  /** Icon representation (emoji/symbol) */
  icon: string;
  /** Whether this tab is currently active/selected */
  isActive: boolean;
  /** Whether the file has unsaved changes */
  isDirty: boolean;
  /** Whether the tab is pinned (won't be auto-closed) */
  isPinned: boolean;
}

/**
 * Props for the Tab component
 */
export interface TabProps {
  /** The tab data to render */
  tab: TabData;
  /** Callback when tab is clicked/selected */
  onSelect: (tabId: TabId) => void;
  /** Callback when tab close button is clicked */
  onClose: (tabId: TabId) => void;
  /** Callback when tab is pinned/unpinned */
  onPin?: (tabId: TabId) => void;
  /** Callback when tab is double-clicked (e.g., to pin) */
  onDoubleClick?: (tabId: TabId) => void;
}

/**
 * Props for the TabBar container component
 */
export interface TabBarProps {
  /** Array of open tabs */
  tabs: TabData[];
  /** ID of the currently active tab */
  activeTabId: TabId | null;
  /** Callback when a tab is selected */
  onTabSelect: (tabId: TabId) => void;
  /** Callback when a tab is closed */
  onTabClose: (tabId: TabId) => void;
  /** Callback when a tab is pinned/unpinned */
  onTabPin?: (tabId: TabId) => void;
  /** Callback when a tab needs to be saved */
  onTabSave?: (tabId: TabId) => void;
  /** Callback to close all other tabs (respects pinned) */
  onCloseOtherTabs?: (tabId: TabId) => void;
  /** Callback to close all tabs to the left (respects pinned) */
  onCloseTabsToLeft?: (tabId: TabId) => void;
  /** Callback to close all tabs to the right (respects pinned) */
  onCloseTabsToRight?: (tabId: TabId) => void;
  /** Callback to close all tabs (respects pinned) */
  onCloseAllTabs?: () => void;
  /** Optional class name for styling */
  className?: string;
}

/**
 * Configuration options for tab behavior
 */
export interface TabConfig {
  /** Maximum number of tabs before oldest unpinned tab is auto-closed */
  maxTabs: number;
  /** Whether to show close button on hover only */
  showCloseOnHover: boolean;
  /** Whether to show file icons */
  showIcons: boolean;
  /** Whether to show dirty indicator */
  showDirtyIndicator: boolean;
}

/**
 * Default tab configuration
 */
export const DEFAULT_TAB_CONFIG: TabConfig = {
  maxTabs: 20,
  showCloseOnHover: true,
  showIcons: true,
  showDirtyIndicator: true,
};

/**
 * Creates a new TabData object from a file path
 * @param filePath - The full file path
 * @param isActive - Whether this tab should be active (default: false)
 * @returns A new TabData object
 */
export function createTabFromPath(
  filePath: string,
  isActive: boolean = false
): TabData {
  const fileName = getFileName(filePath);
  const fileType = getFileType(fileName, false);
  const icon = getFileIcon(fileName, false);

  return {
    id: filePath,
    filePath,
    fileName,
    fileType,
    icon,
    isActive,
    isDirty: false,
    isPinned: false,
  };
}

/**
 * Finds a tab by its ID in the tabs array
 * @param tabs - Array of tabs to search
 * @param tabId - The tab ID to find
 * @returns The found tab or undefined
 */
export function findTabById(
  tabs: TabData[],
  tabId: TabId
): TabData | undefined {
  return tabs.find((tab) => tab.id === tabId);
}

/**
 * Finds a tab by file path
 * @param tabs - Array of tabs to search
 * @param filePath - The file path to find
 * @returns The found tab or undefined
 */
export function findTabByPath(
  tabs: TabData[],
  filePath: string
): TabData | undefined {
  return tabs.find((tab) => tab.filePath === filePath);
}

/**
 * Updates a tab in the array (immutably)
 * @param tabs - The current tabs array
 * @param tabId - The ID of the tab to update
 * @param updates - Partial tab data to merge
 * @returns A new array with the updated tab
 */
export function updateTab(
  tabs: TabData[],
  tabId: TabId,
  updates: Partial<Omit<TabData, 'id'>>
): TabData[] {
  return tabs.map((tab) =>
    tab.id === tabId ? { ...tab, ...updates } : tab
  );
}

/**
 * Sets the active tab (deactivates all others)
 * @param tabs - The current tabs array
 * @param tabId - The ID of the tab to activate
 * @returns A new array with the active tab set
 */
export function setActiveTab(tabs: TabData[], tabId: TabId): TabData[] {
  return tabs.map((tab) => ({
    ...tab,
    isActive: tab.id === tabId,
  }));
}

/**
 * Adds a new tab to the array
 * If a tab with the same path exists, activates it instead
 * @param tabs - The current tabs array
 * @param filePath - The file path to open
 * @returns A new array with the tab added or activated
 */
export function addTab(tabs: TabData[], filePath: string): TabData[] {
  // Check if tab already exists
  const existingTab = findTabByPath(tabs, filePath);
  if (existingTab) {
    // Activate existing tab
    return setActiveTab(tabs, existingTab.id);
  }

  // Create new tab and add it
  const newTab = createTabFromPath(filePath, true);

  // Deactivate all other tabs and add new one
  const deactivatedTabs = tabs.map((tab) => ({ ...tab, isActive: false }));
  return [...deactivatedTabs, newTab];
}

/**
 * Removes a tab from the array
 * If removing the active tab, activates the next/previous tab
 * @param tabs - The current tabs array
 * @param tabId - The ID of the tab to remove
 * @returns A new array with the tab removed and new active tab set
 */
export function removeTab(tabs: TabData[], tabId: TabId): TabData[] {
  const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) {
    return tabs;
  }

  const removedTab = tabs[tabIndex];
  const newTabs = tabs.filter((tab) => tab.id !== tabId);

  // If the removed tab was active, activate another tab
  if (removedTab.isActive && newTabs.length > 0) {
    // Try to activate the tab to the right, or the one to the left
    const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
    return setActiveTab(newTabs, newTabs[newActiveIndex].id);
  }

  return newTabs;
}

/**
 * Gets the currently active tab
 * @param tabs - The tabs array
 * @returns The active tab or undefined
 */
export function getActiveTab(tabs: TabData[]): TabData | undefined {
  return tabs.find((tab) => tab.isActive);
}

/**
 * Moves a tab to a new position in the array
 * @param tabs - The current tabs array
 * @param fromIndex - The current index of the tab
 * @param toIndex - The target index for the tab
 * @returns A new array with the tab moved
 */
export function moveTab(
  tabs: TabData[],
  fromIndex: number,
  toIndex: number
): TabData[] {
  if (
    fromIndex < 0 ||
    fromIndex >= tabs.length ||
    toIndex < 0 ||
    toIndex >= tabs.length ||
    fromIndex === toIndex
  ) {
    return tabs;
  }

  const newTabs = [...tabs];
  const [movedTab] = newTabs.splice(fromIndex, 1);
  newTabs.splice(toIndex, 0, movedTab);
  return newTabs;
}

/**
 * Closes all tabs except the specified one
 * @param tabs - The current tabs array
 * @param tabId - The ID of the tab to keep open
 * @returns A new array with only the specified tab
 */
export function closeOtherTabs(tabs: TabData[], tabId: TabId): TabData[] {
  const tabToKeep = findTabById(tabs, tabId);
  if (!tabToKeep) {
    return tabs;
  }
  return [{ ...tabToKeep, isActive: true }];
}

/**
 * Closes all tabs to the right of the specified tab
 * @param tabs - The current tabs array
 * @param tabId - The ID of the reference tab
 * @returns A new array with tabs to the right removed
 */
export function closeTabsToRight(tabs: TabData[], tabId: TabId): TabData[] {
  const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) {
    return tabs;
  }
  const newTabs = tabs.slice(0, tabIndex + 1);

  // If active tab was removed, activate the rightmost remaining tab
  const activeTab = getActiveTab(newTabs);
  if (!activeTab && newTabs.length > 0) {
    return setActiveTab(newTabs, newTabs[newTabs.length - 1].id);
  }
  return newTabs;
}

/**
 * Closes all unpinned tabs
 * @param tabs - The current tabs array
 * @returns A new array with only pinned tabs
 */
export function closeUnpinnedTabs(tabs: TabData[]): TabData[] {
  const pinnedTabs = tabs.filter((tab) => tab.isPinned);

  // If active tab was unpinned and removed, activate first pinned tab
  const activeTab = getActiveTab(pinnedTabs);
  if (!activeTab && pinnedTabs.length > 0) {
    return setActiveTab(pinnedTabs, pinnedTabs[0].id);
  }
  return pinnedTabs;
}

/**
 * Closes all tabs to the left of the specified tab (except pinned tabs)
 * @param tabs - The current tabs array
 * @param tabId - The ID of the reference tab
 * @returns A new array with tabs to the left removed (except pinned)
 */
export function closeTabsToLeft(tabs: TabData[], tabId: TabId): TabData[] {
  const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) {
    return tabs;
  }

  // Keep: pinned tabs to the left + the reference tab and everything to the right
  const newTabs = tabs.filter((tab, index) => {
    if (index >= tabIndex) return true; // Keep tabs at and after the reference
    return tab.isPinned; // Keep pinned tabs to the left
  });

  // If active tab was removed, activate the reference tab
  const activeTab = getActiveTab(newTabs);
  if (!activeTab && newTabs.length > 0) {
    const refTab = findTabById(newTabs, tabId);
    if (refTab) {
      return setActiveTab(newTabs, tabId);
    }
    return setActiveTab(newTabs, newTabs[0].id);
  }
  return newTabs;
}

/**
 * Closes all tabs to the right of the specified tab (except pinned tabs)
 * @param tabs - The current tabs array
 * @param tabId - The ID of the reference tab
 * @returns A new array with tabs to the right removed (except pinned)
 */
export function closeTabsToRightRespectPinned(tabs: TabData[], tabId: TabId): TabData[] {
  const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) {
    return tabs;
  }

  // Keep: everything up to and including the reference tab + pinned tabs to the right
  const newTabs = tabs.filter((tab, index) => {
    if (index <= tabIndex) return true; // Keep tabs at and before the reference
    return tab.isPinned; // Keep pinned tabs to the right
  });

  // If active tab was removed, activate the reference tab
  const activeTab = getActiveTab(newTabs);
  if (!activeTab && newTabs.length > 0) {
    const refTab = findTabById(newTabs, tabId);
    if (refTab) {
      return setActiveTab(newTabs, tabId);
    }
    return setActiveTab(newTabs, newTabs[newTabs.length - 1].id);
  }
  return newTabs;
}

/**
 * Closes all other tabs except the specified one (keeps pinned tabs)
 * @param tabs - The current tabs array
 * @param tabId - The ID of the tab to keep open
 * @returns A new array with only the specified tab and pinned tabs
 */
export function closeOtherTabsRespectPinned(tabs: TabData[], tabId: TabId): TabData[] {
  const tabToKeep = findTabById(tabs, tabId);
  if (!tabToKeep) {
    return tabs;
  }

  // Keep the specified tab and all pinned tabs
  const newTabs = tabs.filter((tab) => tab.id === tabId || tab.isPinned);

  // Ensure the specified tab is active
  return setActiveTab(newTabs, tabId);
}

/**
 * Closes all tabs (except pinned tabs)
 * @param tabs - The current tabs array
 * @returns A new array with only pinned tabs
 */
export function closeAllTabsRespectPinned(tabs: TabData[]): TabData[] {
  const pinnedTabs = tabs.filter((tab) => tab.isPinned);

  // If active tab was removed, activate the first remaining pinned tab
  const activeTab = getActiveTab(pinnedTabs);
  if (!activeTab && pinnedTabs.length > 0) {
    return setActiveTab(pinnedTabs, pinnedTabs[0].id);
  }
  return pinnedTabs;
}

/**
 * Re-exports FileType for convenience when working with tabs
 */
export type { FileType };
