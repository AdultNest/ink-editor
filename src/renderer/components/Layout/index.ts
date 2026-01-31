/**
 * Layout module exports
 *
 * This module provides the IDE-like layout infrastructure along with
 * integrated components for file navigation and tab management.
 *
 * Primary Components:
 * - Layout: Main layout container with sidebar, tab bar, and content areas
 * - Sidebar: Resizable sidebar with header support
 *
 * Integrated Components (re-exported for convenience):
 * - FileTree: File system tree view for folder navigation
 * - TabBar: Tab bar for managing open files
 *
 * Hooks (re-exported for convenience):
 * - useFileTree: State management for file tree and IPC integration
 * - useTabs: State management for tab operations
 */

import Layout, { type LayoutProps } from './Layout';
import Sidebar, { OpenFolderButton, type SidebarProps, type OpenFolderButtonProps } from './Sidebar';

// Re-export FileTree component and types for integrated usage
export {
  FileTree,
  FileTreeNode,
  type FileTreeProps,
  type FileTreeNodeProps,
  type FileTreeNodeType,
  type FileTreeNodeData,
  type FileType,
} from '../FileTree';

// Re-export TabBar component and types for integrated usage
export {
  TabBar,
  Tab,
  type TabId,
  type TabData,
  type TabProps,
  type TabBarProps,
  type TabConfig,
} from '../TabBar';

// Re-export hooks for file tree and tab state management
export { useFileTree, type UseFileTreeState, type UseFileTreeActions, type UseFileTreeReturn } from '../../hooks/useFileTree';
export { useTabs, type UseTabsState, type UseTabsActions, type UseTabsReturn, type UseTabsOptions } from '../../hooks/useTabs';

// Re-export layout components and their prop types
export { Layout, Sidebar, OpenFolderButton };
export type { LayoutProps, SidebarProps, OpenFolderButtonProps };

// Default export for Layout as the main component
export default Layout;
