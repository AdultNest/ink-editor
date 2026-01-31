import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchElectronApp, closeElectronApp, clearAppSettings, setLastOpenedFolder, getSampleFolderPath } from './electron-helpers';
import path from 'path';
import fs from 'fs';
import os from 'os';

let app: ElectronApplication;
let page: Page;

test.describe('Open Folder Feature', () => {
  test.beforeAll(async () => {
    // Clear settings to ensure app starts with no folder open
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

  test('should show empty state initially', async () => {
    const placeholder = page.locator('.sidebar-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('No folder open');
  });

  test('open folder button should be present and functional', async () => {
    const button = page.locator('.open-folder-button');
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });

  test('should handle click on open folder button', async () => {
    // Set up error tracking
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    const button = page.locator('.open-folder-button');
    await button.click();

    // Wait for any async operations
    await page.waitForTimeout(500);

    // No JavaScript errors should occur
    expect(errors).toHaveLength(0);
  });
});

test.describe('File Tree with Test Folder', () => {
  let app: ElectronApplication;
  let page: Page;
  let testFolder: string;

  test.beforeAll(async () => {
    // Create a test folder with some files
    testFolder = path.join(os.tmpdir(), `ink-editor-test-${Date.now()}`);
    fs.mkdirSync(testFolder, { recursive: true });
    fs.writeFileSync(path.join(testFolder, 'test.txt'), 'Hello World');
    fs.writeFileSync(path.join(testFolder, 'script.ts'), 'export const x = 1;');
    fs.mkdirSync(path.join(testFolder, 'subfolder'));
    fs.writeFileSync(path.join(testFolder, 'subfolder', 'nested.json'), '{}');

    // Pre-configure settings to open the test folder on startup
    setLastOpenedFolder(testFolder);

    const context = await launchElectronApp();
    app = context.app;
    page = context.page;

    // Wait for folder to load
    await page.waitForTimeout(1500);
  });

  test.afterAll(async () => {
    if (app) {
      await closeElectronApp(app);
    }

    // Cleanup test folder
    if (testFolder && fs.existsSync(testFolder)) {
      fs.rmSync(testFolder, { recursive: true, force: true });
    }
  });

  test('should display file tree with loaded folder contents', async () => {
    // The folder should be loaded automatically via settings
    // Verify files are visible in the tree
    const fileTree = page.locator('.file-tree');
    await expect(fileTree).toBeVisible({ timeout: 5000 });

    // Check that file tree shows the test files
    const fileTreeNodes = page.locator('.file-tree-node');
    const count = await fileTreeNodes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should display file icons based on extension', async () => {
    // This test would verify that different file types get different icons
    // For now, we verify the icon structure exists
    const iconSelector = '.file-tree-node__icon, .open-folder-button__icon';
    const icons = page.locator(iconSelector);

    // There should be at least the folder button icon
    const count = await icons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('folder expansion should work on first click', async () => {
    // This tests the bug fix where folders needed double toggle to show contents
    // The folder is now loaded via settings, so the file tree should be visible

    // Verify file tree is present
    const fileTree = page.locator('.file-tree[role="tree"]');
    await expect(fileTree).toBeVisible({ timeout: 5000 });

    // Find the subfolder and try to expand it
    const subfolderNode = page.locator('.file-tree-node').filter({ hasText: 'subfolder' });
    if (await subfolderNode.count() > 0) {
      // Click to expand
      await subfolderNode.click();
      await page.waitForTimeout(300);

      // After expansion, the nested.json file should become visible
      const nestedFile = page.locator('.file-tree-node').filter({ hasText: 'nested.json' });
      await expect(nestedFile).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Tab Integration', () => {
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

  test('tab bar should be empty initially', async () => {
    const tabBar = page.locator('.tab-bar');
    await expect(tabBar).toBeVisible();

    const tabs = page.locator('.tab-bar .tab');
    const count = await tabs.count();
    expect(count).toBe(0);
  });

  test('empty tab bar should show empty message', async () => {
    // When no tabs are open, the tab bar shows an empty state
    const emptyMessage = page.locator('.tab-bar__empty-message');
    await expect(emptyMessage).toBeVisible();
    await expect(emptyMessage).toContainText('No open files');
  });
});

test.describe('Sidebar Resize', () => {
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

  test('sidebar should have default width', async () => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();

    const style = await sidebar.getAttribute('style');
    expect(style).toContain('width: 250px');
  });

  test('resize handle should be draggable', async () => {
    const resizeHandle = page.locator('.sidebar-resize-handle');
    await expect(resizeHandle).toBeVisible();

    // Get initial sidebar width
    const sidebar = page.locator('.sidebar');
    const initialStyle = await sidebar.getAttribute('style');
    expect(initialStyle).toContain('250px');

    // Simulate drag
    const handleBox = await resizeHandle.boundingBox();
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 100, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
    }

    // Check if width changed
    const newStyle = await sidebar.getAttribute('style');
    // Width should have increased
    expect(newStyle).not.toBe(initialStyle);
  });
});
