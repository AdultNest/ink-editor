/**
 * Ink file generator
 *
 * Regenerates .ink file content from parsed state, or performs
 * surgical edits to preserve formatting.
 */

import type { ParsedInk, InkKnot, InkRegion, NodePosition } from './inkTypes';

// Pattern to match position comment
const POSITION_PATTERN = /^(\s*)\/\/\s*<\{\s*"pos-x"\s*:\s*[-\d.]+\s*,\s*"pos-y"\s*:\s*[-\d.]+\s*\}>\s*$/;

// Pattern to match start node position comment
const START_POSITION_PATTERN = /^\/\/\s*<#\s*start:\s*\{\s*"pos-x"\s*:\s*[-\d.]+\s*,\s*"pos-y"\s*:\s*[-\d.]+\s*\}\s*#>\s*$/;

// Pattern to match end node position comment
const END_POSITION_PATTERN = /^\/\/\s*<#\s*end:\s*\{\s*"pos-x"\s*:\s*[-\d.]+\s*,\s*"pos-y"\s*:\s*[-\d.]+\s*\}\s*#>\s*$/;

/**
 * Format a position as a comment string
 */
function formatPositionComment(pos: NodePosition): string {
  return `// <{ "pos-x": ${pos.x.toFixed(1)}, "pos-y": ${pos.y.toFixed(1)} }>`;
}

/**
 * Format start node position as a comment string
 */
function formatStartPositionComment(pos: NodePosition): string {
  return `// <# start: { "pos-x": ${pos.x.toFixed(1)}, "pos-y": ${pos.y.toFixed(1)} } #>`;
}

/**
 * Format end node position as a comment string
 */
function formatEndPositionComment(pos: NodePosition): string {
  return `// <# end: { "pos-x": ${pos.x.toFixed(1)}, "pos-y": ${pos.y.toFixed(1)} } #>`;
}

/**
 * Update or add a position comment in a knot's body
 */
function updatePositionInBody(bodyContent: string, position: NodePosition): string {
  const lines = bodyContent.split('\n');
  const posComment = formatPositionComment(position);

  // Check if first line is already a position comment
  if (lines.length > 0 && POSITION_PATTERN.test(lines[0])) {
    // Replace existing position
    lines[0] = posComment;
  } else {
    // Insert new position at start
    lines.unshift(posComment);
  }

  return lines.join('\n');
}

/**
 * Remove position comment from body content (for display purposes)
 */
export function stripPositionComment(bodyContent: string): string {
  const lines = bodyContent.split('\n');
  if (lines.length > 0 && POSITION_PATTERN.test(lines[0])) {
    return lines.slice(1).join('\n');
  }
  return bodyContent;
}

/**
 * Update a knot's position in the raw source
 */
export function updateKnotPosition(
  rawContent: string,
  knot: InkKnot,
  position: NodePosition
): string {
  const lines = rawContent.split('\n');

  // Find the line after the knot header
  const bodyStartIndex = knot.lineStart; // lineStart is 1-indexed, this gives us the line after header

  // Check if there's already a position comment
  if (bodyStartIndex < lines.length && POSITION_PATTERN.test(lines[bodyStartIndex])) {
    // Replace existing position
    lines[bodyStartIndex] = formatPositionComment(position);
  } else {
    // Insert new position comment after header
    lines.splice(bodyStartIndex, 0, formatPositionComment(position));
  }

  return lines.join('\n');
}

/**
 * Update a knot's content in the raw source
 * This preserves the rest of the file's formatting
 */
export function updateKnotContent(
  rawContent: string,
  knot: InkKnot,
  newBodyContent: string
): string {
  const lines = rawContent.split('\n');

  // Get the header line
  const headerLine = lines[knot.lineStart - 1];

  // Preserve position if it exists
  let finalBody = newBodyContent;
  if (knot.position) {
    finalBody = updatePositionInBody(newBodyContent, knot.position);
  }

  // Build the new knot content
  const newKnotLines = [headerLine, ...finalBody.split('\n')];

  // Replace the old knot lines with the new ones
  const beforeKnot = lines.slice(0, knot.lineStart - 1);
  const afterKnot = lines.slice(knot.lineEnd);

  return [...beforeKnot, ...newKnotLines, ...afterKnot].join('\n');
}

/**
 * Add a new knot to the end of the file
 */
export function addKnot(rawContent: string, knotName: string, position?: NodePosition): string {
  const trimmed = rawContent.trimEnd();
  let newKnot = `\n\n=== ${knotName} ===\n`;
  if (position) {
    newKnot += formatPositionComment(position) + '\n';
  }
  newKnot += '\n';
  return trimmed + newKnot;
}

/**
 * Delete a knot from the file
 */
export function deleteKnot(rawContent: string, knot: InkKnot): string {
  const lines = rawContent.split('\n');

  // Remove the knot lines
  const beforeKnot = lines.slice(0, knot.lineStart - 1);
  const afterKnot = lines.slice(knot.lineEnd);

  // Remove extra blank lines that may have been left
  let result = [...beforeKnot, ...afterKnot].join('\n');

  // Clean up multiple consecutive blank lines (keep max 2)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Add a divert to the end of a knot
 */
export function addDivert(
  rawContent: string,
  sourceKnot: InkKnot,
  targetName: string
): string {
  const lines = rawContent.split('\n');

  // Find a good place to insert the divert (before the last blank line of the knot, or at the end)
  let insertIndex = sourceKnot.lineEnd - 1;

  // Look for the last non-blank line in the knot
  while (insertIndex >= sourceKnot.lineStart && lines[insertIndex].trim() === '') {
    insertIndex--;
  }

  // Insert the divert after the last non-blank line
  const divertLine = `-> ${targetName}`;
  lines.splice(insertIndex + 1, 0, divertLine);

  return lines.join('\n');
}

/**
 * Remove a specific divert from a knot
 */
export function removeDivert(
  rawContent: string,
  sourceKnot: InkKnot,
  targetName: string
): string {
  const lines = rawContent.split('\n');

  // Find and remove lines that contain standalone diverts to the target
  const divertPattern = new RegExp(`^\\s*->\\s*${targetName}\\s*$`);

  for (let i = sourceKnot.lineStart; i < sourceKnot.lineEnd; i++) {
    if (divertPattern.test(lines[i])) {
      lines.splice(i, 1);
      break; // Only remove first occurrence
    }
  }

  return lines.join('\n');
}

/**
 * Update a divert target within a knot
 * Changes a divert from oldTarget to newTarget
 *
 * @param rawContent - The full ink file content
 * @param sourceKnot - The knot containing the divert
 * @param oldTarget - The current target to replace
 * @param newTarget - The new target
 * @param lineNumber - Optional specific line number to update (1-indexed).
 *                     If provided, only updates the divert on that exact line.
 *                     If not provided, updates the first matching divert.
 */
export function updateDivert(
  rawContent: string,
  sourceKnot: InkKnot,
  oldTarget: string,
  newTarget: string,
  lineNumber?: number
): string {
  const lines = rawContent.split('\n');

  // Pattern to match divert to old target (standalone or after choice)
  // This matches: -> oldTarget  or  * text -> oldTarget  or  + text -> oldTarget
  const divertPattern = new RegExp(`(->\\s*)${oldTarget}(\\s*)$`);

  if (lineNumber !== undefined) {
    // Update specific line (convert 1-indexed to 0-indexed)
    const lineIndex = lineNumber - 1;
    if (lineIndex >= 0 && lineIndex < lines.length && divertPattern.test(lines[lineIndex])) {
      lines[lineIndex] = lines[lineIndex].replace(divertPattern, `$1${newTarget}$2`);
    }
  } else {
    // Update first matching divert in the knot
    let found = false;
    for (let i = sourceKnot.lineStart; i < sourceKnot.lineEnd && !found; i++) {
      if (divertPattern.test(lines[i])) {
        lines[i] = lines[i].replace(divertPattern, `$1${newTarget}$2`);
        found = true;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Rename a knot throughout the file
 */
export function renameKnot(
  rawContent: string,
  oldName: string,
  newName: string
): string {
  let result = rawContent;

  // Replace in knot header (=== name === or == name)
  result = result.replace(
    new RegExp(`^(===?\\s*)${oldName}(\\s*===?)?\\s*$`, 'gm'),
    `$1${newName}$2`
  );

  // Replace in diverts (-> name)
  result = result.replace(
    new RegExp(`(->\\s*)${oldName}(?=\\s|$)`, 'g'),
    `$1${newName}`
  );

  return result;
}

/**
 * Rename a region in the file
 */
export function renameRegion(
  rawContent: string,
  oldName: string,
  newName: string
): string {
  // Replace in StartRegion comment: // <# StartRegion: oldName #>
  return rawContent.replace(
    new RegExp(`(//\\s*<#\\s*StartRegion:\\s*)${escapeRegex(oldName)}(\\s*#>)`, 'g'),
    `$1${newName}$2`
  );
}

/**
 * Generate a clean .ink file from ParsedInk
 * Useful for normalizing/reformatting
 */
export function generateInk(parsed: ParsedInk): string {
  const parts: string[] = [];

  // Add externals
  for (const ext of parsed.externals) {
    const params = ext.params.join(', ');
    parts.push(`EXTERNAL ${ext.name}(${params})`);
  }

  if (parsed.externals.length > 0) {
    parts.push(''); // Blank line after externals
  }

  // Add initial divert if present
  if (parsed.initialDivert) {
    parts.push(`-> ${parsed.initialDivert}`);
    parts.push('');
  }

  // Add knots
  for (const knot of parsed.knots) {
    parts.push(`=== ${knot.name} ===`);
    if (knot.position) {
      parts.push(formatPositionComment(knot.position));
    }
    parts.push(stripPositionComment(knot.bodyContent));
    parts.push('');
  }

  return parts.join('\n').trimEnd() + '\n';
}

/**
 * Batch update multiple knot positions
 */
export function updateKnotPositions(
  rawContent: string,
  positions: Map<string, NodePosition>,
  knots: InkKnot[]
): string {
  let result = rawContent;

  // Sort knots by lineStart descending to avoid line number shifts
  const sortedKnots = [...knots].sort((a, b) => b.lineStart - a.lineStart);

  for (const knot of sortedKnots) {
    const pos = positions.get(knot.name);
    if (pos) {
      result = updateKnotPosition(result, knot, pos);
    }
  }

  return result;
}

/**
 * Update a region's position in the raw source
 * The position comment appears on the line after the StartRegion comment
 */
export function updateRegionPosition(
  rawContent: string,
  region: InkRegion,
  position: NodePosition
): string {
  const lines = rawContent.split('\n');

  // The position is on the line after the StartRegion comment
  const positionLineIndex = region.lineStart; // lineStart is 1-indexed for the StartRegion line

  // Check if there's already a position comment on the next line
  if (positionLineIndex < lines.length && POSITION_PATTERN.test(lines[positionLineIndex])) {
    // Replace existing position
    lines[positionLineIndex] = formatPositionComment(position);
  } else {
    // Insert new position comment after StartRegion
    lines.splice(positionLineIndex, 0, formatPositionComment(position));
  }

  return lines.join('\n');
}

/**
 * Batch update multiple region positions
 */
export function updateRegionPositions(
  rawContent: string,
  positions: Map<string, NodePosition>,
  regions: InkRegion[]
): string {
  let result = rawContent;

  // Sort regions by lineStart descending to avoid line number shifts
  const sortedRegions = [...regions].sort((a, b) => b.lineStart - a.lineStart);

  for (const region of sortedRegions) {
    const pos = positions.get(region.name);
    if (pos) {
      result = updateRegionPosition(result, region, pos);
    }
  }

  return result;
}

/**
 * Move a knot into a region or out of all regions
 *
 * @param rawContent - The full ink file content
 * @param knot - The knot to move
 * @param targetRegion - The region to move the knot into, or null to move out of any region
 * @param regions - All regions in the file
 * @returns The updated content
 */
export function moveKnotToRegion(
  rawContent: string,
  knot: InkKnot,
  targetRegion: InkRegion | null,
  regions: InkRegion[]
): string {
  const lines = rawContent.split('\n');

  // Extract the knot's lines
  const knotLines = lines.slice(knot.lineStart - 1, knot.lineEnd);

  // Remove the knot from its current position
  const beforeKnot = lines.slice(0, knot.lineStart - 1);
  const afterKnot = lines.slice(knot.lineEnd);
  let remaining = [...beforeKnot, ...afterKnot];

  // Clean up extra blank lines
  let result = remaining.join('\n').replace(/\n{3,}/g, '\n\n');
  const resultLines = result.split('\n');

  if (targetRegion) {
    // Moving into a region - find the EndRegion line
    // We need to re-find the region's position since line numbers may have shifted
    const endRegionPattern = /\/\/\s*<#\s*EndRegion\s*#>/;
    const startRegionPattern = new RegExp(`\\/\\/\\s*<#\\s*StartRegion:\\s*${escapeRegex(targetRegion.name)}\\s*#>`);

    let inTargetRegion = false;
    let insertIndex = -1;

    for (let i = 0; i < resultLines.length; i++) {
      if (startRegionPattern.test(resultLines[i])) {
        inTargetRegion = true;
      } else if (inTargetRegion && endRegionPattern.test(resultLines[i])) {
        // Insert before the EndRegion
        insertIndex = i;
        break;
      }
    }

    if (insertIndex >= 0) {
      // Insert the knot before EndRegion with proper spacing
      const insertLines = ['', ...knotLines];
      resultLines.splice(insertIndex, 0, ...insertLines);
    } else {
      // Couldn't find the region - just append at the end
      resultLines.push('', ...knotLines);
    }
  } else {
    // Moving out of any region - append at the end of the file
    resultLines.push('', ...knotLines);
  }

  // Clean up and return
  return resultLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Add a new empty region to the file
 *
 * @param rawContent - The full ink file content
 * @param regionName - The name of the new region
 * @param position - Optional position for the region
 * @returns The updated content
 */
export function addRegion(
  rawContent: string,
  regionName: string,
  position?: NodePosition
): string {
  const trimmed = rawContent.trimEnd();

  let newRegion = `\n\n// <# StartRegion: ${regionName} #>\n`;
  if (position) {
    newRegion += formatPositionComment(position) + '\n';
  }
  newRegion += '\n// <# EndRegion #>\n';

  return trimmed + newRegion;
}

/**
 * Delete a region from the file
 * Note: This only removes the region markers, not the knots inside
 *
 * @param rawContent - The full ink file content
 * @param regionName - The name of the region to delete
 * @returns The updated content
 */
export function deleteRegion(
  rawContent: string,
  regionName: string
): string {
  const lines = rawContent.split('\n');
  const result: string[] = [];

  const startPattern = new RegExp(`^\\s*\\/\\/\\s*<#\\s*StartRegion:\\s*${escapeRegex(regionName)}\\s*#>`);
  const endPattern = /^\s*\/\/\s*<#\s*EndRegion\s*#>/;
  const positionPattern = /^\s*\/\/\s*<\{\s*"pos-x"/;

  let inTargetRegion = false;
  let skipNextIfPosition = false;

  for (const line of lines) {
    if (startPattern.test(line)) {
      inTargetRegion = true;
      skipNextIfPosition = true;
      continue; // Skip the start marker
    }

    if (skipNextIfPosition && positionPattern.test(line)) {
      skipNextIfPosition = false;
      continue; // Skip the position comment after StartRegion
    }
    skipNextIfPosition = false;

    if (inTargetRegion && endPattern.test(line)) {
      inTargetRegion = false;
      continue; // Skip the end marker
    }

    // Keep all other lines (including knots that were in the region)
    result.push(line);
  }

  // Clean up extra blank lines
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * Update the START node position in the file
 * The position comment is stored at the beginning of the file (preamble)
 */
export function updateStartPosition(
  rawContent: string,
  position: NodePosition
): string {
  const lines = rawContent.split('\n');
  const posComment = formatStartPositionComment(position);

  // Find existing start position comment
  let existingIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (START_POSITION_PATTERN.test(lines[i])) {
      existingIndex = i;
      break;
    }
    // Stop searching once we hit a knot
    if (/^===?\s*\w+/.test(lines[i].trim())) {
      break;
    }
  }

  if (existingIndex >= 0) {
    // Replace existing
    lines[existingIndex] = posComment;
  } else {
    // Insert at the very beginning
    lines.unshift(posComment);
  }

  return lines.join('\n');
}

/**
 * Update the END node position in the file
 * The position comment is stored at the beginning of the file (preamble)
 */
export function updateEndPosition(
  rawContent: string,
  position: NodePosition
): string {
  const lines = rawContent.split('\n');
  const posComment = formatEndPositionComment(position);

  // Find existing end position comment
  let existingIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (END_POSITION_PATTERN.test(lines[i])) {
      existingIndex = i;
      break;
    }
    // Stop searching once we hit a knot
    if (/^===?\s*\w+/.test(lines[i].trim())) {
      break;
    }
  }

  if (existingIndex >= 0) {
    // Replace existing
    lines[existingIndex] = posComment;
  } else {
    // Insert after start position (if exists) or at the very beginning
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (START_POSITION_PATTERN.test(lines[i])) {
        insertIndex = i + 1;
        break;
      }
      // Stop searching once we hit a knot
      if (/^===?\s*\w+/.test(lines[i].trim())) {
        break;
      }
    }
    lines.splice(insertIndex, 0, posComment);
  }

  return lines.join('\n');
}
