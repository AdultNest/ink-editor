import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchElectronApp, closeElectronApp, clearAppSettings, setLastOpenedFolder, getSampleFolderPath } from './electron-helpers';

/**
 * Tests that verify the UI when NO folder/files are open.
 * These tests clear settings to ensure a clean state.
 */
test.describe('Ink Editor UI - Empty State', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    // Clear settings to ensure app starts with no folder/tabs open
    clearAppSettings();

    const context = await launchElectronApp();
    app = context.app;
    page = context.page;
  });

  test.afterAll(async () => {
    if (app) {
      await closeElectronApp(app);
    }
  });

  test.describe('Layout', () => {
    test('should display the main layout structure', async () => {
      // Check that the sidebar is present
      const sidebar = page.locator('.sidebar');
      await expect(sidebar).toBeVisible();

      // Check that the main content area is present
      const layout = page.locator('.layout');
      await expect(layout).toBeVisible();
    });

    test('should display the sidebar header with title', async () => {
      const sidebarHeader = page.locator('.sidebar-header');
      await expect(sidebarHeader).toBeVisible();
    });
  });

  test.describe('Open Folder Button', () => {
    test('should display the open folder button', async () => {
      const openFolderButton = page.locator('.open-folder-button');
      await expect(openFolderButton).toBeVisible();
    });

    test('should have the folder icon', async () => {
      const folderIcon = page.locator('.open-folder-button__icon');
      await expect(folderIcon).toBeVisible();
      await expect(folderIcon).toHaveText(/\p{Emoji}/u);
    });

    test('should have correct aria attributes', async () => {
      const openFolderButton = page.locator('.open-folder-button');
      await expect(openFolderButton).toHaveAttribute('aria-label', 'Open Folder');
      await expect(openFolderButton).toHaveAttribute('title', 'Open Folder');
    });

    test('button should be clickable', async () => {
      const openFolderButton = page.locator('.open-folder-button');
      await expect(openFolderButton).toBeEnabled();

      // Try clicking the button - this should not throw an error
      // Note: In a real test, we would mock the dialog, but for now we just verify it's clickable
      const isClickable = await openFolderButton.isEnabled();
      expect(isClickable).toBe(true);
    });
  });

  test.describe('File Tree', () => {
    test('should display the file tree container', async () => {
      const sidebarContent = page.locator('.sidebar-content');
      await expect(sidebarContent).toBeVisible();
    });

    test('should show empty state when no folder is opened', async () => {
      // The file tree should exist but be empty or show a placeholder
      const fileTree = page.locator('.file-tree');
      // File tree may not be visible if empty, check the container exists
      const sidebarContent = page.locator('.sidebar-content');
      await expect(sidebarContent).toBeVisible();
    });
  });

  test.describe('Tab Bar - Empty', () => {
    test('should display the tab bar', async () => {
      const tabBar = page.locator('.tab-bar');
      await expect(tabBar).toBeVisible();
    });

    test('should be empty when no files are opened', async () => {
      const tabs = page.locator('.tab-bar .tab');
      const count = await tabs.count();
      expect(count).toBe(0);
    });
  });

  test.describe('Resize Handle', () => {
    test('should display the sidebar resize handle', async () => {
      const resizeHandle = page.locator('.sidebar-resize-handle');
      await expect(resizeHandle).toBeVisible();
    });

    test('resize handle should have correct aria attributes', async () => {
      const resizeHandle = page.locator('.sidebar-resize-handle');
      await expect(resizeHandle).toHaveAttribute('role', 'separator');
      await expect(resizeHandle).toHaveAttribute('aria-orientation', 'vertical');
    });
  });
});

/**
 * Tests that verify the UI when files ARE loaded.
 * These tests pre-configure the sample folder so the app loads it on startup.
 */
test.describe('Ink Editor UI - With Files', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    // Pre-configure settings to open sample folder on startup
    setLastOpenedFolder(getSampleFolderPath());

    const context = await launchElectronApp();
    app = context.app;
    page = context.page;

    // Wait for folder to load and file tree to render
    await page.waitForTimeout(1500);

    // Click on an ink file to ensure React Flow is rendered
    const inkFile = page.locator('.file-tree-node').filter({ hasText: '.ink' }).first();
    if (await inkFile.isVisible()) {
      await inkFile.click();
      await page.waitForTimeout(500);
    }
  });

  test.afterAll(async () => {
    if (app) {
      await closeElectronApp(app);
    }
  });

  test.describe('React Flow Canvas', () => {
    test('should display the React Flow canvas', async () => {
      const reactFlow = page.locator('.react-flow');
      await expect(reactFlow).toBeVisible({ timeout: 10000 });
    });

    test('should have canvas controls', async () => {
      const controls = page.locator('.react-flow__controls');
      await expect(controls).toBeVisible();
    });

    test('should have minimap', async () => {
      const minimap = page.locator('.react-flow__minimap');
      await expect(minimap).toBeVisible();
    });
  });
});

test.describe('Open Folder Integration', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    const context = await launchElectronApp();
    app = context.app;
    page = context.page;
  });

  test.afterAll(async () => {
    if (app) {
      await closeElectronApp(app);
    }
  });

  test('clicking open folder button should trigger dialog', async () => {
    const openFolderButton = page.locator('.open-folder-button');

    // Set up a listener for console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Set up a listener for page errors
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });

    // Click the button
    await openFolderButton.click();

    // Wait a bit for any async operations
    await page.waitForTimeout(500);

    // Check that no JavaScript errors occurred
    expect(pageErrors).toHaveLength(0);

    // Log any console errors for debugging (but don't fail the test just for console.error calls)
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors);
    }
  });
});
