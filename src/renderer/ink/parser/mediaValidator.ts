/**
 * Media Validator
 *
 * Validates that image and video files exist in the project's
 * Images/ and Videos/ folders.
 *
 * Also provides utilities for extracting media references from ink content.
 */

import type { ParsedInk, InkParseError } from './inkTypes';

/**
 * Result of validating a media file
 */
export interface MediaValidationResult {
  /** The filename that was checked */
  filename: string;
  /** Whether the file exists */
  exists: boolean;
  /** The full resolved path */
  fullPath: string;
  /** The type of media */
  type: 'image' | 'video';
}

/**
 * MediaValidator class
 *
 * Validates media file existence with caching for performance.
 */
export class MediaValidator {
  private cache: Map<string, MediaValidationResult> = new Map();
  private projectPath: string;

  /**
   * Create a new MediaValidator
   *
   * @param projectPath - The root path of the project
   */
  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Validate an image file
   *
   * @param filename - The image filename (without path)
   * @returns Validation result
   */
  async validateImage(filename: string): Promise<MediaValidationResult> {
    const cacheKey = `image:${filename}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const fullPath = this.resolveImagePath(filename);
    let exists = false;

    try {
      exists = await window.electronAPI.fileExists(fullPath);
    } catch {
      exists = false;
    }

    const result: MediaValidationResult = {
      filename,
      exists,
      fullPath,
      type: 'image',
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Validate a video file
   *
   * @param filename - The video filename (without path)
   * @returns Validation result
   */
  async validateVideo(filename: string): Promise<MediaValidationResult> {
    const cacheKey = `video:${filename}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const fullPath = this.resolveVideoPath(filename);
    let exists = false;

    try {
      exists = await window.electronAPI.fileExists(fullPath);
    } catch {
      exists = false;
    }

    const result: MediaValidationResult = {
      filename,
      exists,
      fullPath,
      type: 'video',
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Resolve the full path to an image file
   */
  private resolveImagePath(filename: string): string {
    const separator = this.projectPath.includes('\\') ? '\\' : '/';
    return `${this.projectPath}${separator}Images${separator}${filename}`;
  }

  /**
   * Resolve the full path to a video file
   */
  private resolveVideoPath(filename: string): string {
    const separator = this.projectPath.includes('\\') ? '\\' : '/';
    return `${this.projectPath}${separator}Videos${separator}${filename}`;
  }

  /**
   * Get a local file URL for displaying in the app
   *
   * @param fullPath - The full file path
   * @returns A URL that can be used in img/video src
   */
  getLocalUrl(fullPath: string): string {
    return window.electronAPI.getLocalFileUrl(fullPath);
  }

  /**
   * Find the actual image file given a base filename (without extension)
   * Searches for files matching the base name with common image extensions
   *
   * @param baseFilename - The filename without extension (e.g., "myimage")
   * @returns The full filename with extension, or the original if not found
   */
  async findImageFile(baseFilename: string): Promise<string> {
    // If it already has an extension, return as-is
    if (baseFilename.includes('.')) {
      return baseFilename;
    }

    // If no project path, can't resolve
    if (!this.projectPath) {
      console.warn('[MediaValidator] No project path set, cannot resolve image:', baseFilename);
      return baseFilename;
    }

    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    const separator = this.projectPath.includes('\\') ? '\\' : '/';
    const imagesPath = `${this.projectPath}${separator}Images`;

    console.log('[MediaValidator] Finding image:', baseFilename, 'in', imagesPath);

    for (const ext of imageExtensions) {
      const testPath = `${imagesPath}${separator}${baseFilename}${ext}`;
      try {
        const exists = await window.electronAPI.fileExists(testPath);
        console.log('[MediaValidator] Checking:', testPath, '- exists:', exists);
        if (exists) {
          console.log('[MediaValidator] Found:', `${baseFilename}${ext}`);
          return `${baseFilename}${ext}`;
        }
      } catch (err) {
        console.error('[MediaValidator] Error checking file:', testPath, err);
        // Continue searching
      }
    }

    // Not found, return original (might fail to load, but that's expected)
    console.warn('[MediaValidator] Image not found:', baseFilename);
    return baseFilename;
  }

  /**
   * Find the actual video file given a base filename (without extension)
   * Searches for files matching the base name with common video extensions
   *
   * @param baseFilename - The filename without extension (e.g., "myvideo")
   * @returns The full filename with extension, or the original if not found
   */
  async findVideoFile(baseFilename: string): Promise<string> {
    // If it already has an extension, return as-is
    if (baseFilename.includes('.')) {
      return baseFilename;
    }

    // If no project path, can't resolve
    if (!this.projectPath) {
      console.warn('[MediaValidator] No project path set, cannot resolve video:', baseFilename);
      return baseFilename;
    }

    const videoExtensions = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'];
    const separator = this.projectPath.includes('\\') ? '\\' : '/';
    const videosPath = `${this.projectPath}${separator}Videos`;

    console.log('[MediaValidator] Finding video:', baseFilename, 'in', videosPath);

    for (const ext of videoExtensions) {
      const testPath = `${videosPath}${separator}${baseFilename}${ext}`;
      try {
        const exists = await window.electronAPI.fileExists(testPath);
        console.log('[MediaValidator] Checking:', testPath, '- exists:', exists);
        if (exists) {
          console.log('[MediaValidator] Found:', `${baseFilename}${ext}`);
          return `${baseFilename}${ext}`;
        }
      } catch (err) {
        console.error('[MediaValidator] Error checking file:', testPath, err);
        // Continue searching
      }
    }

    // Not found, return original (might fail to load, but that's expected)
    console.warn('[MediaValidator] Video not found:', baseFilename);
    return baseFilename;
  }

  /**
   * Clear the validation cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all available images in the Images folder
   *
   * @returns Array of image filenames
   */
  async getAvailableImages(): Promise<string[]> {
    try {
      const separator = this.projectPath.includes('\\') ? '\\' : '/';
      const imagesPath = `${this.projectPath}${separator}Images`;

      // Check if Images folder exists
      const exists = await window.electronAPI.fileExists(imagesPath);
      if (!exists) {
        return [];
      }

      // Read the directory using readDir
      const entries = await window.electronAPI.readDir(imagesPath);

      // Filter for image extensions (only files, not directories)
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
      return entries
        .filter((entry) => {
          if (entry.isDirectory) return false;
          const ext = entry.name.toLowerCase().substring(entry.name.lastIndexOf('.'));
          return imageExtensions.includes(ext);
        })
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Get all available videos in the Videos folder
   *
   * @returns Array of video filenames
   */
  async getAvailableVideos(): Promise<string[]> {
    try {
      const separator = this.projectPath.includes('\\') ? '\\' : '/';
      const videosPath = `${this.projectPath}${separator}Videos`;

      // Check if Videos folder exists
      const exists = await window.electronAPI.fileExists(videosPath);
      if (!exists) {
        return [];
      }

      // Read the directory using readDir
      const entries = await window.electronAPI.readDir(videosPath);

      // Filter for video extensions (only files, not directories)
      const videoExtensions = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'];
      return entries
        .filter((entry) => {
          if (entry.isDirectory) return false;
          const ext = entry.name.toLowerCase().substring(entry.name.lastIndexOf('.'));
          return videoExtensions.includes(ext);
        })
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }
}

/**
 * Create a MediaValidator instance
 *
 * @param projectPath - The root path of the project
 * @returns A new MediaValidator instance
 */
export function createMediaValidator(projectPath: string): MediaValidator {
  return new MediaValidator(projectPath);
}

// ============================================================================
// Media Reference Extraction (platform-independent)
// ============================================================================

/**
 * Media reference extracted from ink content
 */
export interface MediaReference {
  /** The type of media */
  type: 'image' | 'player-image' | 'video' | 'player-video';
  /** The filename (without path, may or may not have extension) */
  filename: string;
  /** The line number where this reference appears */
  lineNumber: number;
  /** The knot name where this reference appears */
  knotName: string;
}

// Patterns matching knotContentParser.ts
const MEDIA_PATTERNS = {
  /** NPC image: <filename> (not starting with player-, video-, fake-type-, side-story-, wait-) */
  image: /^<(?!player-|video-|fake-type-|side-story-|wait-)([^>]+)>$/,
  /** Player image: <player-filename> (not player-video-) */
  playerImage: /^<player-(?!video-)([^>]+)>$/,
  /** NPC video: <video-filename> */
  video: /^<video-([^>]+)>$/,
  /** Player video: <player-video-filename> */
  playerVideo: /^<player-video-([^>]+)>$/,
};

/**
 * Extract all media references from parsed ink content
 *
 * @param parsedInk - The parsed ink content
 * @returns Array of media references found
 */
export function extractMediaReferences(parsedInk: ParsedInk): MediaReference[] {
  const references: MediaReference[] = [];

  for (const knot of parsedInk.knots) {
    const lines = knot.bodyContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = knot.lineStart + 1 + i;

      // Check for player video (most specific first)
      let match = line.match(MEDIA_PATTERNS.playerVideo);
      if (match) {
        references.push({
          type: 'player-video',
          filename: match[1],
          lineNumber,
          knotName: knot.name,
        });
        continue;
      }

      // Check for NPC video
      match = line.match(MEDIA_PATTERNS.video);
      if (match) {
        references.push({
          type: 'video',
          filename: match[1],
          lineNumber,
          knotName: knot.name,
        });
        continue;
      }

      // Check for player image
      match = line.match(MEDIA_PATTERNS.playerImage);
      if (match) {
        references.push({
          type: 'player-image',
          filename: match[1],
          lineNumber,
          knotName: knot.name,
        });
        continue;
      }

      // Check for NPC image (least specific)
      match = line.match(MEDIA_PATTERNS.image);
      if (match) {
        references.push({
          type: 'image',
          filename: match[1],
          lineNumber,
          knotName: knot.name,
        });
        continue;
      }
    }
  }

  return references;
}

/**
 * Supported image extensions
 */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];

/**
 * Supported video extensions
 */
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'];

/**
 * Check if a media reference exists in a set of available files
 * Handles files with and without extensions
 *
 * @param filename - The filename to check (may or may not have extension)
 * @param availableFiles - Set of available filenames
 * @param extensions - Extensions to try if filename has no extension
 * @returns True if file exists
 */
export function mediaFileExists(
  filename: string,
  availableFiles: Set<string>,
  extensions: string[]
): boolean {
  // Check exact match first
  if (availableFiles.has(filename)) {
    return true;
  }

  // If filename has no extension, try with common extensions
  if (!filename.includes('.')) {
    for (const ext of extensions) {
      if (availableFiles.has(`${filename}${ext}`)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate media references against available files
 * This is a pure function that doesn't require filesystem access.
 *
 * @param references - Media references to validate
 * @param availableImages - Set of available image filenames
 * @param availableVideos - Set of available video filenames
 * @returns Array of parse errors for missing media
 */
export function validateMediaReferences(
  references: MediaReference[],
  availableImages: Set<string>,
  availableVideos: Set<string>
): InkParseError[] {
  const errors: InkParseError[] = [];

  for (const ref of references) {
    const isVideo = ref.type === 'video' || ref.type === 'player-video';
    const availableFiles = isVideo ? availableVideos : availableImages;
    const extensions = isVideo ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;

    if (!mediaFileExists(ref.filename, availableFiles, extensions)) {
      errors.push({
        message: `Missing ${ref.type} file '${ref.filename}'`,
        lineNumber: ref.lineNumber,
        severity: 'error',
        category: 'media',
      });
    }
  }

  return errors;
}
