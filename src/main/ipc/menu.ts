import { Menu, BrowserWindow, app, shell } from 'electron';
import { readSettings, type RecentProject } from './settings';

/**
 * Builds and sets the application menu with recent projects
 */
export async function buildMenu(): Promise<void> {
  const settings = await readSettings();
  const recentProjects = settings.recentProjects || [];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send('menu:openFolder');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Recent Projects',
          submenu: buildRecentProjectsSubmenu(recentProjects),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send('menu:save');
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com/your-repo/ink-editor');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Builds the Recent Projects submenu
 */
function buildRecentProjectsSubmenu(recentProjects: RecentProject[]): Electron.MenuItemConstructorOptions[] {
  if (recentProjects.length === 0) {
    return [
      {
        label: 'No Recent Projects',
        enabled: false,
      },
    ];
  }

  const items: Electron.MenuItemConstructorOptions[] = recentProjects.map((project, index) => ({
    label: `${index + 1}. ${project.name}`,
    sublabel: project.path,
    click: () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        win.webContents.send('menu:openRecentProject', project.path);
      }
    },
  }));

  // Add separator and clear option
  items.push(
    { type: 'separator' },
    {
      label: 'Clear Recent Projects',
      click: () => {
        const win = BrowserWindow.getFocusedWindow();
        if (win) {
          win.webContents.send('menu:clearRecentProjects');
        }
      },
    }
  );

  return items;
}

/**
 * Rebuilds the menu (called when recent projects change)
 */
export function rebuildMenu(): void {
  buildMenu().catch(console.error);
}

/**
 * Initialize the application menu
 */
export function initializeMenu(): void {
  // Build menu when app is ready
  app.whenReady().then(() => {
    buildMenu().catch(console.error);
  });
}
