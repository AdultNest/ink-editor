/**
 * Layout component for IDE-like interface
 *
 * Provides a three-panel layout with:
 * - Sidebar (left) - for FileTree with folder navigation
 * - Tab Bar (top of main area) - for TabBar with open file tabs
 * - Content Area (main) - for the main editor content (ReactFlow canvas)
 *
 * @example
 * ```tsx
 * import { Layout, Sidebar } from './components/Layout';
 * import { FileTree } from './components/FileTree';
 * import { TabBar } from './components/TabBar';
 * import { useFileTree } from './hooks/useFileTree';
 * import { useTabs } from './hooks/useTabs';
 *
 * function App() {
 *   const { treeData, isLoading, openFolder, handleToggle } = useFileTree();
 *   const { tabs, activeTabId, openTab, closeTab, selectTab, togglePin } = useTabs();
 *
 *   return (
 *     <Layout
 *       sidebar={
 *         <Sidebar title="EXPLORER" headerActions={<button onClick={openFolder}>📂</button>}>
 *           <FileTree
 *             data={treeData}
 *             isLoading={isLoading}
 *             onActivate={(node) => openTab(node.id)}
 *             onToggle={handleToggle}
 *           />
 *         </Sidebar>
 *       }
 *       tabBar={
 *         <TabBar
 *           tabs={tabs}
 *           activeTabId={activeTabId}
 *           onTabSelect={selectTab}
 *           onTabClose={closeTab}
 *           onTabPin={togglePin}
 *         />
 *       }
 *     >
 *       <ReactFlowCanvas />
 *     </Layout>
 *   );
 * }
 * ```
 */

import type { ReactNode } from 'react';
import './Layout.css';

export interface LayoutProps {
  /** Sidebar content - typically a Sidebar component containing FileTree */
  sidebar?: ReactNode;
  /** Tab bar content - typically a TabBar component for managing open files */
  tabBar?: ReactNode;
  /** Main content area - typically the ReactFlow canvas or editor content */
  children?: ReactNode;
  /** Additional CSS class name for the layout container */
  className?: string;
}

function Layout({ sidebar, tabBar, children, className }: LayoutProps) {
  const layoutClassName = className ? `layout ${className}` : 'layout';

  return (
    <div className={layoutClassName}>
      {sidebar && (
        <div className="layout-sidebar">
          {sidebar}
        </div>
      )}
      <div className="layout-main">
        {tabBar && (
          <div className="layout-tab-bar">
            {tabBar}
          </div>
        )}
        <div className="layout-content">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Layout;
