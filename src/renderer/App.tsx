import { useCallback, useState, useEffect, useRef } from 'react';
import '@xyflow/react/dist/style.css';

import {
  Layout,
  Sidebar,
  OpenFolderButton,
  FileTree,
  TabBar,
  useFileTree,
  useTabs,
  type FileTreeNodeType,
} from './components/Layout';
import { ContentView, type ContentViewHandle } from './components/ContentView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SaveChangesDialog } from './components/SaveChangesDialog';
import { type TabData, type TabId } from './components/TabBar/types';

/**
 * Editor config structure for persisting UI state
 */
interface EditorConfig {
  openTabs: string[];
  activeTab: string | null;
}

function App() {
  // File tree state management
  const {
    rootPath,
    treeData,
    isLoading,
    error,
    openFolder: openFolderBase,
    handleToggle,
    setSelectedNode,
    createFile,
    createFolder,
    importFiles,
    deleteItem,
    createProject: createProjectBase,
  } = useFileTree();

  // Tab state management
  const {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    closeTab,
    selectTab,
    togglePin,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    setDirty,
  } = useTabs();

  // Reference to the ContentView for saving
  const contentViewRef = useRef<ContentViewHandle>(null);

  // Pending close tab state (for save confirmation dialog)
  const [pendingCloseTab, setPendingCloseTab] = useState<TabData | null>(null);
  const [isSavingForClose, setIsSavingForClose] = useState(false);

  // Track if we're loading editor config to avoid saving during load
  const isLoadingConfigRef = useRef(false);
  const previousRootPathRef = useRef<string | null>(null);

  // Delete confirmation dialog state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    path: string;
    name: string;
  }>({ isOpen: false, path: '', name: '' });

  /**
   * Handle file tree node activation (double-click on file)
   * Opens the file in a new tab (or activates existing tab)
   */
  const handleFileActivate = useCallback(
    (node: FileTreeNodeType) => {
      // Only open files (not directories) in tabs
      if (!node.data.isDirectory) {
        openTab(node.id);
      }
    },
    [openTab]
  );

  /**
   * Handle file tree node selection (single click)
   */
  const handleFileSelect = useCallback(
    (node: FileTreeNodeType | null) => {
      setSelectedNode(node);
    },
    [setSelectedNode]
  );

  /**
   * Handle dirty state changes from ContentView
   */
  const handleDirtyChange = useCallback(
    (isDirty: boolean) => {
      if (activeTabId) {
        setDirty(activeTabId, isDirty);
      }
    },
    [activeTabId, setDirty]
  );

  /**
   * Safe close tab - checks for unsaved changes before closing
   */
  const handleCloseTab = useCallback(
    (tabId: TabId) => {
      const tab = tabs.find(t => t.id === tabId);
      if (!tab) return;

      // If tab has unsaved changes, show confirmation dialog
      if (tab.isDirty) {
        // If this isn't the active tab, switch to it first so save works correctly
        if (tab.id !== activeTabId) {
          selectTab(tab.id);
        }
        setPendingCloseTab(tab);
      } else {
        // No unsaved changes, close directly
        closeTab(tabId);
      }
    },
    [tabs, activeTabId, selectTab, closeTab]
  );

  /**
   * Handle save and close from save changes dialog
   */
  const handleSaveAndClose = useCallback(async () => {
    if (!pendingCloseTab) return;

    setIsSavingForClose(true);
    try {
      // Save the content
      if (contentViewRef.current) {
        await contentViewRef.current.save();
      }
      // Close the tab
      closeTab(pendingCloseTab.id);
      setPendingCloseTab(null);
    } catch (error) {
      console.error('Failed to save:', error);
      // Keep dialog open on error
    } finally {
      setIsSavingForClose(false);
    }
  }, [pendingCloseTab, closeTab]);

  /**
   * Handle don't save from save changes dialog
   */
  const handleDontSave = useCallback(() => {
    if (!pendingCloseTab) return;
    closeTab(pendingCloseTab.id);
    setPendingCloseTab(null);
  }, [pendingCloseTab, closeTab]);

  /**
   * Handle cancel from save changes dialog
   */
  const handleCancelClose = useCallback(() => {
    setPendingCloseTab(null);
  }, []);

  /**
   * Handle delete request - shows confirmation dialog
   */
  const handleDeleteRequest = useCallback((path: string) => {
    // Extract name from path
    const name = path.split(/[/\\]/).pop() || path;
    setDeleteConfirm({ isOpen: true, path, name });
  }, []);

  /**
   * Handle delete confirmation - actually deletes the item
   */
  const handleDeleteConfirm = useCallback(async () => {
    const { path } = deleteConfirm;

    // Close any open tabs for this file (or files in this directory)
    for (const tab of tabs) {
      if (tab.filePath === path || tab.filePath.startsWith(path + '\\') || tab.filePath.startsWith(path + '/')) {
        closeTab(tab.id);
      }
    }

    // Delete the item
    await deleteItem(path);

    // Close the dialog
    setDeleteConfirm({ isOpen: false, path: '', name: '' });
  }, [deleteConfirm, tabs, closeTab, deleteItem]);

  /**
   * Handle delete cancel
   */
  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ isOpen: false, path: '', name: '' });
  }, []);

  /**
   * Handle saving a single tab from context menu
   */
  const handleSaveTab = useCallback(
    async (tabId: TabId) => {
      // Find the tab to save
      const tab = tabs.find(t => t.id === tabId);
      if (!tab || !tab.isDirty) return;

      // If the tab isn't active, we need to switch to it first
      // because save works on the active content view
      if (tabId !== activeTabId) {
        selectTab(tabId);
        // Wait a tick for state to update
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Save the content
      if (contentViewRef.current) {
        await contentViewRef.current.save();
      }
    },
    [tabs, activeTabId, selectTab]
  );

  /**
   * Handle show in explorer
   */
  const handleShowInExplorer = useCallback(async (path: string) => {
    await window.electronAPI.showInExplorer(path);
  }, []);

  /**
   * Get the .editorconfig path for the current project
   */
  const getEditorConfigPath = useCallback((projectPath: string) => {
    const separator = projectPath.includes('\\') ? '\\' : '/';
    return `${projectPath}${separator}.editorconfig`;
  }, []);

  /**
   * Convert absolute path to relative path (from project root)
   */
  const toRelativePath = useCallback((absolutePath: string, projectPath: string): string => {
    // Normalize separators for comparison
    const normalizedAbsolute = absolutePath.replace(/\\/g, '/');
    const normalizedProject = projectPath.replace(/\\/g, '/');

    if (normalizedAbsolute.startsWith(normalizedProject)) {
      let relative = normalizedAbsolute.slice(normalizedProject.length);
      // Remove leading slash
      if (relative.startsWith('/')) {
        relative = relative.slice(1);
      }
      return relative;
    }
    // Return as-is if not under project path
    return absolutePath;
  }, []);

  /**
   * Convert relative path to absolute path (from project root)
   */
  const toAbsolutePath = useCallback((relativePath: string, projectPath: string): string => {
    // If already absolute, return as-is
    if (relativePath.includes(':') || relativePath.startsWith('/')) {
      return relativePath;
    }
    const separator = projectPath.includes('\\') ? '\\' : '/';
    // Normalize the relative path to use the correct separator
    const normalizedRelative = relativePath.replace(/[/\\]/g, separator);
    return `${projectPath}${separator}${normalizedRelative}`;
  }, []);

  /**
   * Save editor config to .editorconfig file
   */
  const saveEditorConfig = useCallback(async () => {
    if (!rootPath || isLoadingConfigRef.current) return;

    const config: EditorConfig = {
      openTabs: tabs.map(tab => toRelativePath(tab.filePath, rootPath)),
      activeTab: activeTab ? toRelativePath(activeTab.filePath, rootPath) : null,
    };

    try {
      const configPath = getEditorConfigPath(rootPath);
      await window.electronAPI.writeFile(configPath, JSON.stringify(config, null, 2));
    } catch {
      // Silently ignore errors saving config
    }
  }, [rootPath, tabs, activeTab, getEditorConfigPath, toRelativePath]);

  /**
   * Load editor config from .editorconfig file
   */
  const loadEditorConfig = useCallback(async (projectPath: string) => {
    isLoadingConfigRef.current = true;
    try {
      const configPath = getEditorConfigPath(projectPath);
      const exists = await window.electronAPI.fileExists(configPath);
      if (!exists) {
        isLoadingConfigRef.current = false;
        return;
      }

      const content = await window.electronAPI.readFile(configPath);
      const config: EditorConfig = JSON.parse(content);

      // Open tabs from config (convert relative to absolute paths)
      for (const relativePath of config.openTabs) {
        const absolutePath = toAbsolutePath(relativePath, projectPath);
        const fileExists = await window.electronAPI.fileExists(absolutePath);
        if (fileExists) {
          openTab(absolutePath);
        }
      }

      // Select the active tab
      if (config.activeTab) {
        const activeAbsolutePath = toAbsolutePath(config.activeTab, projectPath);
        // Need to wait a tick for tabs state to update
        setTimeout(() => {
          const currentTabs = tabs;
          const activeTabData = currentTabs.find(t => t.filePath === activeAbsolutePath);
          if (activeTabData) {
            selectTab(activeTabData.id);
          }
        }, 100);
      }
    } catch {
      // Silently ignore errors loading config
    } finally {
      isLoadingConfigRef.current = false;
    }
  }, [getEditorConfigPath, openTab, selectTab, tabs, toAbsolutePath]);

  /**
   * Wrapper for openFolder that closes tabs and saves/loads config
   */
  const openFolder = useCallback(async () => {
    // Save config for current project before switching
    if (rootPath) {
      await saveEditorConfig();
    }

    // Close all tabs when changing projects
    closeAllTabs();

    // Open the new folder
    const newPath = await openFolderBase();

    // Load config for new project
    if (newPath) {
      await loadEditorConfig(newPath);
    }

    return newPath;
  }, [rootPath, saveEditorConfig, closeAllTabs, openFolderBase, loadEditorConfig]);

  /**
   * Wrapper for createProject that closes tabs and loads config
   */
  const createProject = useCallback(async () => {
    // Save config for current project before switching
    if (rootPath) {
      await saveEditorConfig();
    }

    // Close all tabs when changing projects
    closeAllTabs();

    // Create the new project
    const newPath = await createProjectBase();

    // Load config for new project (will be empty for new projects)
    if (newPath) {
      await loadEditorConfig(newPath);
    }

    return newPath;
  }, [rootPath, saveEditorConfig, closeAllTabs, createProjectBase, loadEditorConfig]);

  /**
   * Save editor config when tabs change
   */
  useEffect(() => {
    if (rootPath && !isLoadingConfigRef.current && tabs.length > 0) {
      // Debounce the save
      const timeoutId = setTimeout(() => {
        saveEditorConfig();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [rootPath, tabs, activeTabId, saveEditorConfig]);

  /**
   * Load editor config when rootPath changes (e.g., on initial load)
   */
  useEffect(() => {
    if (rootPath && rootPath !== previousRootPathRef.current) {
      previousRootPathRef.current = rootPath;
      // Only load config if not coming from openFolder/createProject
      // (they handle it themselves)
      if (!isLoadingConfigRef.current && tabs.length === 0) {
        loadEditorConfig(rootPath);
      }
    }
  }, [rootPath, tabs.length, loadEditorConfig]);

  return (
    <Layout
      sidebar={
        <Sidebar
          title="EXPLORER"
          headerActions={
            <>
              <button
                type="button"
                className="sidebar-header-button"
                onClick={createProject}
                title="New Project"
                aria-label="New Project"
              >
                <span aria-hidden="true">✨</span>
              </button>
              <OpenFolderButton onClick={openFolder} />
            </>
          }
        >
          {error ? (
            <div className="sidebar-error">
              <p className="sidebar-error-message">{error}</p>
            </div>
          ) : treeData.length === 0 && !isLoading ? (
            <div className="sidebar-placeholder">
              <p>No folder open</p>
              <p className="sidebar-hint">Click the folder icon to open a project</p>
              <button
                type="button"
                className="sidebar-placeholder-button"
                onClick={createProject}
              >
                ✨ New Project
              </button>
            </div>
          ) : (
            <FileTree
              data={treeData}
              rootPath={rootPath ?? undefined}
              isLoading={isLoading}
              onSelect={handleFileSelect}
              onActivate={handleFileActivate}
              onToggle={handleToggle}
              onCreateFile={createFile}
              onCreateFolder={createFolder}
              onImportFiles={importFiles}
              onDelete={handleDeleteRequest}
              onShowInExplorer={handleShowInExplorer}
              height={window.innerHeight - 100}
              emptyMessage="Empty folder"
            />
          )}
        </Sidebar>
      }
      tabBar={
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={selectTab}
          onTabClose={handleCloseTab}
          onTabPin={togglePin}
          onTabSave={handleSaveTab}
          onCloseOtherTabs={closeOtherTabs}
          onCloseTabsToLeft={closeTabsToLeft}
          onCloseTabsToRight={closeTabsToRight}
          onCloseAllTabs={closeAllTabs}
        />
      }
    >
      <ContentView
        ref={contentViewRef}
        activeTab={activeTab}
        onDirtyChange={handleDirtyChange}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Item"
        message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Save changes confirmation dialog */}
      <SaveChangesDialog
        isOpen={pendingCloseTab !== null}
        fileName={pendingCloseTab?.fileName ?? ''}
        isSaving={isSavingForClose}
        onSave={handleSaveAndClose}
        onDontSave={handleDontSave}
        onCancel={handleCancelClose}
      />
    </Layout>
  );
}

export default App;
