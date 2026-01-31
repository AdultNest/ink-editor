import { protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Custom protocol name for serving local files
 * Usage: local-file:///C:/path/to/file.png
 */
export const LOCAL_FILE_PROTOCOL = 'local-file';

/**
 * Registers the custom local-file protocol
 * This allows safe loading of local files in the renderer process
 * Must be called after app.whenReady()
 */
export function registerLocalFileProtocol(): void {
  protocol.handle(LOCAL_FILE_PROTOCOL, (request) => {
    // Extract the file path from the URL
    // URL format: local-file:///C:/path/to/file.png or local-file:///path/to/file.png
    const url = request.url;

    // Remove the protocol prefix
    let filePath = url.slice(`${LOCAL_FILE_PROTOCOL}:///`.length);

    // Decode URI components (handles spaces and special chars)
    filePath = decodeURIComponent(filePath);

    // On Windows, the path might start with a drive letter
    // On Unix, it starts with /
    if (process.platform === 'win32' && !filePath.match(/^[A-Za-z]:/)) {
      // If no drive letter, assume it's a relative path issue
      filePath = '/' + filePath;
    }

    // Convert to proper file URL and fetch using net module
    const fileUrl = pathToFileURL(filePath).href;

    return net.fetch(fileUrl);
  });
}

/**
 * Converts an absolute file path to a local-file:// URL
 * @param filePath - The absolute file path
 * @returns The local-file:// URL
 */
export function filePathToLocalUrl(filePath: string): string {
  // Normalize separators to forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');
  // Encode special characters but preserve path structure
  const encodedPath = normalizedPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${LOCAL_FILE_PROTOCOL}:///${encodedPath}`;
}
