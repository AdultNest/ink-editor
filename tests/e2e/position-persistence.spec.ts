import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchElectronApp, closeElectronApp, takeScreenshot, setLastOpenedFolder, getSampleFolderPath } from './electron-helpers';

let app: ElectronApplication;
let page: Page;

test.describe('Node Position Persistence', () => {
  test.beforeAll(async () => {
    // Pre-configure settings to open sample folder on startup
    setLastOpenedFolder(getSampleFolderPath());

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
  });

  test('should persist node positions when switching between Graph and Raw views', async () => {
    // Step 1: Open an ink file with positions (grouped-chat.ink)
    // The sample folder is already loaded via settings
    console.log('Step 1: Opening ink file...');

    // Navigate to conversations folder and click on grouped-chat.ink
    const conversationsFolder = page.locator('.file-tree-node:has-text("conversations")');
    if (await conversationsFolder.count() > 0) {
      await conversationsFolder.click();
      await page.waitForTimeout(500);
    }

    const inkFile = page.locator('.file-tree-node:has-text("grouped-chat.ink")');
    if (await inkFile.count() > 0) {
      await inkFile.click();
      await page.waitForTimeout(1000);
    } else {
      // Try convo folder
      const convoFolder = page.locator('.file-tree-node:has-text("convo")');
      if (await convoFolder.count() > 0) {
        await convoFolder.click();
        await page.waitForTimeout(500);
      }

      // Try any .ink file
      const anyInkFile = page.locator('.file-tree-node >> text=/.ink$/');
      if (await anyInkFile.count() > 0) {
        await anyInkFile.first().click();
        await page.waitForTimeout(1000);
      }
    }

    // Wait for React Flow to render
    await page.waitForSelector('.react-flow', { timeout: 5000 });
    console.log('React Flow canvas visible');

    // Step 3: Find a knot node and get its initial position
    console.log('Step 3: Finding a knot node...');
    const knotNode = page.locator('.react-flow__node-knotNode').first();
    await expect(knotNode).toBeVisible({ timeout: 5000 });

    // Get initial position
    const initialBox = await knotNode.boundingBox();
    if (!initialBox) {
      throw new Error('Could not get node bounding box');
    }
    console.log(`Initial node position: x=${initialBox.x}, y=${initialBox.y}`);

    // Take screenshot of initial state
    await takeScreenshot(page, 'position-test-01-initial');

    // Step 4: Drag the node to a new position
    console.log('Step 4: Dragging node...');
    const dragOffsetX = 100;
    const dragOffsetY = 50;

    // Drag the node
    await knotNode.hover();
    await page.mouse.down();
    await page.mouse.move(initialBox.x + dragOffsetX, initialBox.y + dragOffsetY, { steps: 10 });
    await page.mouse.up();

    // Wait for drag to complete
    await page.waitForTimeout(200);

    // Get position after drag
    const afterDragBox = await knotNode.boundingBox();
    if (!afterDragBox) {
      throw new Error('Could not get node bounding box after drag');
    }
    console.log(`Position after drag: x=${afterDragBox.x}, y=${afterDragBox.y}`);

    // Verify node actually moved
    expect(afterDragBox.x).not.toBe(initialBox.x);
    console.log('Node was successfully dragged');

    // Take screenshot after drag
    await takeScreenshot(page, 'position-test-02-after-drag');

    // Step 5: Switch to Raw view
    console.log('Step 5: Switching to Raw view...');
    const rawTab = page.locator('.ink-editor-tab:has-text("Raw")');
    await rawTab.click();
    await page.waitForTimeout(500);

    // Verify we're in raw view
    const rawEditor = page.locator('.ink-raw-editor').first();
    await expect(rawEditor).toBeVisible({ timeout: 3000 });
    console.log('Switched to Raw view');

    // Take screenshot of raw view
    await takeScreenshot(page, 'position-test-03-raw-view');

    // Step 6: Switch back to Graph view
    console.log('Step 6: Switching back to Graph view...');
    const graphTab = page.locator('.ink-editor-tab:has-text("Graph")');
    await graphTab.click();
    await page.waitForTimeout(500);

    // Wait for React Flow to render again
    await page.waitForSelector('.react-flow', { timeout: 5000 });
    await page.waitForTimeout(500);

    // Take screenshot after switching back
    await takeScreenshot(page, 'position-test-04-back-to-graph');

    // Step 7: Get the node's position after switching views
    console.log('Step 7: Checking node position after view switch...');
    const knotNodeAfter = page.locator('.react-flow__node-knotNode').first();
    await expect(knotNodeAfter).toBeVisible({ timeout: 5000 });

    const afterSwitchBox = await knotNodeAfter.boundingBox();
    if (!afterSwitchBox) {
      throw new Error('Could not get node bounding box after view switch');
    }
    console.log(`Position after view switch: x=${afterSwitchBox.x}, y=${afterSwitchBox.y}`);

    // Step 8: Verify the position was preserved (within tolerance for viewport changes)
    const tolerance = 20; // Allow some tolerance for viewport differences
    const positionPreserved =
      Math.abs(afterSwitchBox.x - afterDragBox.x) < tolerance &&
      Math.abs(afterSwitchBox.y - afterDragBox.y) < tolerance;

    console.log(`Position preserved: ${positionPreserved}`);
    console.log(`Delta X: ${Math.abs(afterSwitchBox.x - afterDragBox.x)}`);
    console.log(`Delta Y: ${Math.abs(afterSwitchBox.y - afterDragBox.y)}`);

    // This is the critical assertion - position should be preserved
    expect(positionPreserved).toBe(true);
  });

  test('should persist node positions on FIRST view switch cycle (not just second)', async () => {
    // This test matches the exact user-reported bug:
    // 1. Move a node
    // 2. Switch to Raw and back to Graph
    // 3. Node should be at moved position (BUG: it resets to original)
    // 4. Switch to Raw and back again
    // 5. Node is finally at correct position

    // Wait for React Flow
    await page.waitForSelector('.react-flow', { timeout: 5000 });

    // Find a knot node
    const knotNode = page.locator('.react-flow__node-knotNode').first();
    await expect(knotNode).toBeVisible({ timeout: 5000 });

    // Get ORIGINAL position (before any drag)
    const originalBox = await knotNode.boundingBox();
    if (!originalBox) throw new Error('Could not get original bounding box');
    console.log(`ORIGINAL position: x=${originalBox.x.toFixed(1)}, y=${originalBox.y.toFixed(1)}`);

    // Step 1: Move the node
    console.log('Step 1: Moving node...');
    const dragX = 120;
    const dragY = 80;
    await knotNode.hover();
    await page.mouse.down();
    await page.mouse.move(originalBox.x + dragX, originalBox.y + dragY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    const afterDragBox = await knotNode.boundingBox();
    if (!afterDragBox) throw new Error('Could not get post-drag bounding box');
    console.log(`AFTER DRAG position: x=${afterDragBox.x.toFixed(1)}, y=${afterDragBox.y.toFixed(1)}`);

    // Verify drag actually moved the node
    const dragWorked = Math.abs(afterDragBox.x - originalBox.x) > 50;
    expect(dragWorked).toBe(true);

    // Step 2: Switch to Raw view
    console.log('Step 2: Switching to Raw...');
    await page.locator('.ink-editor-tab:has-text("Raw")').click();
    await page.waitForTimeout(200);

    // Step 3: Switch back to Graph (FIRST CYCLE)
    console.log('Step 3: Switching back to Graph (FIRST CYCLE)...');
    await page.locator('.ink-editor-tab:has-text("Graph")').click();
    await page.waitForTimeout(300);

    // Check position after FIRST cycle
    const afterFirstCycleBox = await knotNode.boundingBox();
    if (!afterFirstCycleBox) throw new Error('Could not get post-first-cycle bounding box');
    console.log(`AFTER FIRST CYCLE position: x=${afterFirstCycleBox.x.toFixed(1)}, y=${afterFirstCycleBox.y.toFixed(1)}`);

    // THE CRITICAL CHECK: Position should match afterDragBox, NOT originalBox
    const firstCycleDeltaFromDrag = Math.abs(afterFirstCycleBox.x - afterDragBox.x) + Math.abs(afterFirstCycleBox.y - afterDragBox.y);
    const firstCycleDeltaFromOriginal = Math.abs(afterFirstCycleBox.x - originalBox.x) + Math.abs(afterFirstCycleBox.y - originalBox.y);

    console.log(`  Delta from DRAG position: ${firstCycleDeltaFromDrag.toFixed(1)}`);
    console.log(`  Delta from ORIGINAL position: ${firstCycleDeltaFromOriginal.toFixed(1)}`);

    // Step 4 & 5: Second cycle (for comparison)
    console.log('Step 4: Switching to Raw (second time)...');
    await page.locator('.ink-editor-tab:has-text("Raw")').click();
    await page.waitForTimeout(200);

    console.log('Step 5: Switching back to Graph (SECOND CYCLE)...');
    await page.locator('.ink-editor-tab:has-text("Graph")').click();
    await page.waitForTimeout(300);

    const afterSecondCycleBox = await knotNode.boundingBox();
    if (!afterSecondCycleBox) throw new Error('Could not get post-second-cycle bounding box');
    console.log(`AFTER SECOND CYCLE position: x=${afterSecondCycleBox.x.toFixed(1)}, y=${afterSecondCycleBox.y.toFixed(1)}`);

    const secondCycleDeltaFromDrag = Math.abs(afterSecondCycleBox.x - afterDragBox.x) + Math.abs(afterSecondCycleBox.y - afterDragBox.y);
    console.log(`  Delta from DRAG position: ${secondCycleDeltaFromDrag.toFixed(1)}`);

    // ASSERTIONS
    // After FIRST cycle, node should be at dragged position (not original)
    const firstCyclePreserved = firstCycleDeltaFromDrag < 30; // Within 30px of drag position
    const firstCycleReset = firstCycleDeltaFromOriginal < 30; // Within 30px of original (BAD)

    console.log('\n=== RESULTS ===');
    console.log(`First cycle preserved drag position: ${firstCyclePreserved}`);
    console.log(`First cycle RESET to original (BUG): ${firstCycleReset}`);
    console.log(`Second cycle preserved drag position: ${secondCycleDeltaFromDrag < 30}`);

    // This is the critical assertion - FIRST cycle should preserve position
    expect(firstCyclePreserved).toBe(true);
  });

  test('should persist node positions immediately without waiting for debounce', async () => {
    // This test specifically checks that positions are flushed when switching views
    // without waiting for the 500ms debounce

    // Wait for React Flow to be visible
    await page.waitForSelector('.react-flow', { timeout: 5000 });

    // Find any knot node (use last to avoid overlap issues with first nodes)
    const knotNodes = page.locator('.react-flow__node-knotNode');
    await expect(knotNodes.first()).toBeVisible({ timeout: 5000 });

    // Use the last node to avoid overlap issues
    const knotNode = knotNodes.last();

    // Get initial position
    const initialBox = await knotNode.boundingBox();
    if (!initialBox) {
      throw new Error('Could not get node bounding box');
    }

    // Drag the node using force to bypass pointer event intercept issues
    // This can happen when nodes overlap in the graph
    await knotNode.hover({ force: true });
    await page.mouse.down();
    await page.mouse.move(initialBox.x + 150, initialBox.y + 75, { steps: 5 });
    await page.mouse.up();

    // IMMEDIATELY switch views (don't wait for 500ms debounce)
    const rawTab = page.locator('.ink-editor-tab:has-text("Raw")');
    await rawTab.click();

    // Wait just a tiny bit for the view to switch
    await page.waitForTimeout(100);

    // Switch back
    const graphTab = page.locator('.ink-editor-tab:has-text("Graph")');
    await graphTab.click();

    await page.waitForTimeout(300);

    // Check position
    const afterBox = await knotNode.boundingBox();
    if (!afterBox) {
      throw new Error('Could not get node bounding box after switch');
    }

    console.log('Quick switch test:');
    console.log(`  Initial: x=${initialBox.x}, y=${initialBox.y}`);
    console.log(`  After: x=${afterBox.x}, y=${afterBox.y}`);

    // Position should have changed from initial (node was dragged)
    const movedFromInitial =
      Math.abs(afterBox.x - initialBox.x) > 50 ||
      Math.abs(afterBox.y - initialBox.y) > 50;

    expect(movedFromInitial).toBe(true);
  });
});

// Test to verify the console logs are showing correct behavior
// Fresh app instance test to verify position is NOT reset to file's original position
test.describe('Position Persistence - Fresh Instance', () => {
  test('node should NOT reset to file position after view switch', async () => {
    // Pre-configure settings and launch fresh app instance
    setLastOpenedFolder(getSampleFolderPath());
    const context = await launchElectronApp();
    const testPage = context.page;

    try {
      // Wait for folder to load
      await testPage.waitForTimeout(1500);

      // Open an ink file
      const inkFile = testPage.locator('.file-tree-node >> text=/.ink$/');
      if (await inkFile.count() > 0) {
        await inkFile.first().click();
        await testPage.waitForTimeout(1000);
      }

      // Wait for React Flow
      await testPage.waitForSelector('.react-flow', { timeout: 5000 });
      await testPage.waitForTimeout(500);

      // Find a knot node
      const knotNode = testPage.locator('.react-flow__node-knotNode').first();
      await expect(knotNode).toBeVisible({ timeout: 5000 });

      // Get FILE's original position (this is what the file says the position should be)
      const fileOriginalBox = await knotNode.boundingBox();
      if (!fileOriginalBox) throw new Error('Could not get file original position');
      console.log(`FILE ORIGINAL: x=${fileOriginalBox.x.toFixed(1)}, y=${fileOriginalBox.y.toFixed(1)}`);

      // Drag the node significantly (100+ pixels)
      const dragOffsetX = 150;
      const dragOffsetY = 100;
      await knotNode.hover();
      await testPage.mouse.down();
      await testPage.mouse.move(
        fileOriginalBox.x + fileOriginalBox.width / 2 + dragOffsetX,
        fileOriginalBox.y + fileOriginalBox.height / 2 + dragOffsetY,
        { steps: 10 }
      );
      await testPage.mouse.up();
      await testPage.waitForTimeout(100);

      const afterDragBox = await knotNode.boundingBox();
      if (!afterDragBox) throw new Error('Could not get after drag position');
      console.log(`AFTER DRAG: x=${afterDragBox.x.toFixed(1)}, y=${afterDragBox.y.toFixed(1)}`);

      // Verify drag worked
      const dragDistance = Math.sqrt(
        Math.pow(afterDragBox.x - fileOriginalBox.x, 2) +
        Math.pow(afterDragBox.y - fileOriginalBox.y, 2)
      );
      console.log(`Drag distance: ${dragDistance.toFixed(1)}px`);
      expect(dragDistance).toBeGreaterThan(50);

      // Switch to Raw view
      await testPage.locator('.ink-editor-tab:has-text("Raw")').click();
      await testPage.waitForTimeout(300);

      // Switch back to Graph view
      await testPage.locator('.ink-editor-tab:has-text("Graph")').click();
      await testPage.waitForTimeout(500);

      // Get position after view switch
      const afterSwitchBox = await knotNode.boundingBox();
      if (!afterSwitchBox) throw new Error('Could not get after switch position');
      console.log(`AFTER SWITCH: x=${afterSwitchBox.x.toFixed(1)}, y=${afterSwitchBox.y.toFixed(1)}`);

      // Calculate distances
      const distanceFromDrag = Math.sqrt(
        Math.pow(afterSwitchBox.x - afterDragBox.x, 2) +
        Math.pow(afterSwitchBox.y - afterDragBox.y, 2)
      );
      const distanceFromFileOriginal = Math.sqrt(
        Math.pow(afterSwitchBox.x - fileOriginalBox.x, 2) +
        Math.pow(afterSwitchBox.y - fileOriginalBox.y, 2)
      );

      console.log(`Distance from DRAG position: ${distanceFromDrag.toFixed(1)}px`);
      console.log(`Distance from FILE ORIGINAL: ${distanceFromFileOriginal.toFixed(1)}px`);

      // THE KEY ASSERTION:
      // Position should be close to DRAG position (< 50px)
      // Position should be FAR from FILE ORIGINAL (> 50px)
      console.log('\n=== VERDICT ===');
      const preservedDragPosition = distanceFromDrag < 50;
      const resetToFileOriginal = distanceFromFileOriginal < 50;

      console.log(`Preserved drag position: ${preservedDragPosition} (distance ${distanceFromDrag.toFixed(1)}px)`);
      console.log(`Reset to file original (BUG): ${resetToFileOriginal} (distance ${distanceFromFileOriginal.toFixed(1)}px)`);

      // This should pass - position preserved
      expect(preservedDragPosition).toBe(true);
      // This should fail if bug exists - position reset
      expect(resetToFileOriginal).toBe(false);

    } finally {
      await closeElectronApp(context.app);
    }
  });
});

test.describe('Position Persistence Debug', () => {
  test('should log position changes and flush operations', async () => {
    // Pre-configure settings and launch app
    setLastOpenedFolder(getSampleFolderPath());
    const context = await launchElectronApp();
    const testPage = context.page;

    try {
      // Collect console logs
      const consoleLogs: string[] = [];
      testPage.on('console', msg => {
        const text = msg.text();
        if (text.includes('[onNodesChange]') ||
            text.includes('[flushPendingPositions]') ||
            text.includes('[setViewModeWithFlush]')) {
          consoleLogs.push(text);
          console.log('CAPTURED:', text);
        }
      });

      // Wait for folder to load
      await testPage.waitForTimeout(1500);

      // Open an ink file
      const inkFile = testPage.locator('.file-tree-node >> text=/.ink$/');
      if (await inkFile.count() > 0) {
        await inkFile.first().click();
        await testPage.waitForTimeout(1000);
      }

      // Wait for React Flow
      await testPage.waitForSelector('.react-flow', { timeout: 5000 });

      // Find and drag a node
      const knotNode = testPage.locator('.react-flow__node-knotNode').first();
      if (await knotNode.count() > 0) {
        const box = await knotNode.boundingBox();
        if (box) {
          await knotNode.hover();
          await testPage.mouse.down();
          await testPage.mouse.move(box.x + 100, box.y + 50, { steps: 5 });
          await testPage.mouse.up();

          await testPage.waitForTimeout(100);

          // Switch to Raw
          const rawTab = testPage.locator('.ink-editor-tab:has-text("Raw")');
          await rawTab.click();

          await testPage.waitForTimeout(200);
        }
      }

      // Log all captured console messages
      console.log('\n=== Captured Console Logs ===');
      for (const log of consoleLogs) {
        console.log(log);
      }
      console.log('=== End Console Logs ===\n');

      // Verify we captured the expected logs
      const hasPositionChange = consoleLogs.some(l => l.includes('[onNodesChange]'));
      const hasFlush = consoleLogs.some(l => l.includes('[flushPendingPositions]'));
      const hasViewSwitch = consoleLogs.some(l => l.includes('[setViewModeWithFlush]'));

      console.log('Log summary:');
      console.log(`  Position change logged: ${hasPositionChange}`);
      console.log(`  Flush logged: ${hasFlush}`);
      console.log(`  View switch logged: ${hasViewSwitch}`);

    } finally {
      await closeElectronApp(context.app);
    }
  });
});
