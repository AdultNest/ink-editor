/**
 * TabBar component exports
 *
 * Re-exports the TabBar component, Tab component, and all related types
 * for convenient importing from a single location.
 */

import TabBar from './TabBar';
import Tab from './Tab';
import {
  type TabId,
  type TabData,
  type TabProps,
  type TabBarProps,
  type TabConfig,
  type FileType,
  DEFAULT_TAB_CONFIG,
  createTabFromPath,
  findTabById,
  findTabByPath,
  updateTab,
  setActiveTab,
  addTab,
  removeTab,
  getActiveTab,
  moveTab,
  closeOtherTabs,
  closeTabsToRight,
  closeUnpinnedTabs,
} from './types';

// Default export is the main TabBar component
export default TabBar;

// Named exports for components
export { TabBar, Tab };

// Named exports for types
export type {
  TabId,
  TabData,
  TabProps,
  TabBarProps,
  TabConfig,
  FileType,
};

// Named exports for constants and utilities
export {
  DEFAULT_TAB_CONFIG,
  createTabFromPath,
  findTabById,
  findTabByPath,
  updateTab,
  setActiveTab,
  addTab,
  removeTab,
  getActiveTab,
  moveTab,
  closeOtherTabs,
  closeTabsToRight,
  closeUnpinnedTabs,
};
