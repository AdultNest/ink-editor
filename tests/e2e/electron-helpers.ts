import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface ElectronAppContext {
  app: ElectronApplication;
  page: Page;
}

/**
 * Gets the path to the Electron app's userData directory where settings are stored.
 * This matches what Electron's app.getPath('userData') returns.
 */
function getAppDataPath(): string {
  const appName = 'Ink Editor';

  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName);
    default: // Linux and others
      return path.join(os.homedir(), '.config', appName);
  }
}

/**
 * Clears the app settings file to ensure a clean state for testing.
 * This removes the lastOpenedFolder setting so the app starts fresh.
 */
export function clearAppSettings(): void {
  const settingsPath = path.join(getAppDataPath(), 'settings.json');

  try {
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
      console.log('Cleared app settings:', settingsPath);
    }
  } catch (error) {
    console.warn('Could not clear settings file:', error);
  }
}

/**
 * Sets the last opened folder in app settings.
 * This allows tests to pre-configure which folder the app will open on startup.
 */
export function setLastOpenedFolder(folderPath: string): void {
  const appDataPath = getAppDataPath();
  const settingsPath = path.join(appDataPath, 'settings.json');

  try {
    // Ensure the app data directory exists
    if (!fs.existsSync(appDataPath)) {
      fs.mkdirSync(appDataPath, { recursive: true });
    }

    const settings = { lastOpenedFolder: folderPath };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('Set last opened folder:', folderPath);
  } catch (error) {
    console.warn('Could not set last opened folder:', error);
  }
}

/**
 * Gets the path to the sample folder for testing.
 */
export function getSampleFolderPath(): string {
  return path.join(__dirname, '../../sample');
}

/**
 * Gets the path to the packaged Electron app executable
 */
function getPackagedAppPath(): string {
  const projectRoot = path.join(__dirname, '../..');

  // List all potential paths for each platform/architecture
  const potentialPaths = [
    // Windows x64
    path.join(projectRoot, 'out', 'Ink Editor-win32-x64', 'Ink Editor.exe'),
    // Windows arm64
    path.join(projectRoot, 'out', 'Ink Editor-win32-arm64', 'Ink Editor.exe'),
    // macOS x64
    path.join(projectRoot, 'out', 'Ink Editor-darwin-x64', 'Ink Editor.app', 'Contents', 'MacOS', 'Ink Editor'),
    // macOS arm64 (Apple Silicon)
    path.join(projectRoot, 'out', 'Ink Editor-darwin-arm64', 'Ink Editor.app', 'Contents', 'MacOS', 'Ink Editor'),
    // Linux x64 - executable name variations
    path.join(projectRoot, 'out', 'Ink Editor-linux-x64', 'ink-editor'),
    path.join(projectRoot, 'out', 'Ink Editor-linux-x64', 'Ink Editor'),
    // Linux arm64 - executable name variations
    path.join(projectRoot, 'out', 'Ink Editor-linux-arm64', 'ink-editor'),
    path.join(projectRoot, 'out', 'Ink Editor-linux-arm64', 'Ink Editor'),
  ];

  for (const appPath of potentialPaths) {
    if (fs.existsSync(appPath)) {
      console.log('Found packaged app at:', appPath);
      return appPath;
    }
  }

  // Debug: List what's in the out directory
  const outDir = path.join(projectRoot, 'out');
  if (fs.existsSync(outDir)) {
    console.log('Contents of out directory:', fs.readdirSync(outDir));
  } else {
    console.log('Out directory does not exist:', outDir);
  }

  throw new Error('Could not find packaged app. Run "npm run package" first.');
}

/**
 * Launches the Electron app for testing.
 * Uses the packaged executable directly.
 */
export async function launchElectronApp(): Promise<ElectronAppContext> {
  const executablePath = getPackagedAppPath();
  console.log('Launching packaged app:', executablePath);

  // Launch using the packaged executable directly
  // Need to set args to empty array to avoid Playwright adding default args
  const app = await electron.launch({
    executablePath,
    args: [],
    timeout: 120000,
    env: {
      ...process.env,
      // Disable GPU for CI environments
      ELECTRON_DISABLE_GPU: '1',
    },
  });

  console.log('App launched, waiting for window...');

  // Wait for the first window with extended timeout
  const page = await app.firstWindow({ timeout: 60000 });
  console.log('Got window');

  // Wait for navigation to complete
  await page.waitForLoadState('load', { timeout: 30000 });
  console.log('Page loaded');

  // Give React time to hydrate
  await page.waitForTimeout(2000);

  // Debug: Check what's on the page
  const title = await page.title();
  console.log('Page title:', title);

  const content = await page.content();
  console.log('Page content (first 500 chars):', content.substring(0, 500));

  return { app, page };
}

/**
 * Closes the Electron app cleanly
 */
export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

/**
 * Gets all windows from the Electron app
 */
export async function getAllWindows(app: ElectronApplication): Promise<Page[]> {
  return app.windows();
}

/**
 * Debug helper: Get page HTML content
 */
export async function getPageContent(page: Page): Promise<string> {
  return page.content();
}

/**
 * Debug helper: Take a screenshot
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/${name}.png` });
}
