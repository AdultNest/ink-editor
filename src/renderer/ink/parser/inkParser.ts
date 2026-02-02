/**
 * Ink file parser
 *
 * Parses .ink files using regex patterns to extract knots, choices, diverts, and externals.
 */

import type {
  ParsedInk,
  InkKnot,
  InkChoice,
  InkDivert,
  InkExternal,
  InkParseError,
  NodePosition,
  InkRegion,
  InkStoryFlag,
  InkConditionalBlock,
  InkConditionalBranch,
} from './inkTypes';

// Regex patterns for parsing
const PATTERNS = {
  // Matches knot headers: === name === or == name or === name
  knot: /^(?:===?\s*)(\w+)(?:\s*===?)?\s*$/,

  // Matches diverts: -> name or -> END or -> knot.stitch
  divert: /->\s*(\w+(?:\.\w+)?|END)/g,

  // Matches choices: * or + followed by optional <label>, text and optional divert
  // Captures: 1=choice type (* or +), 2=label (in angle brackets), 3=bracketed text, 4=unbracketed text, 5=divert target
  // Examples: * <Tease> Oh yeah? Do tell... -> target
  //           * [bracketed text] -> target
  //           * unbracketed text -> target
  //           * text -> knot.stitch (stitch divert)
  choice: /^(\*|\+)\s*(?:<([^>]+)>\s*)?(?:\[([^\]]+)\]|(.+?))(?:\s*->\s*(\w+(?:\.\w+)?|END))?\s*$/,

  // Matches EXTERNAL declarations
  external: /^EXTERNAL\s+(\w+)\s*\(([^)]*)\)/,

  // Matches standalone diverts at the start of a line
  standaloneDivert: /^\s*->\s*(\w+(?:\.\w+)?|END)\s*$/,

  // Matches comments
  comment: /\/\/.*$/,

  // Matches multi-line comments (simplified - doesn't handle nested)
  multiLineComment: /\/\*[\s\S]*?\*\//g,

  // Matches position comment: // <{ "pos-x": 123.4, "pos-y": 567.8 }>
  positionComment: /\/\/\s*<\{\s*"pos-x"\s*:\s*([-\d.]+)\s*,\s*"pos-y"\s*:\s*([-\d.]+)\s*\}>/,

  // Matches region start comment: // <# StartRegion: Region Name #>
  regionStart: /\/\/\s*<#\s*StartRegion:\s*(.+?)\s*#>/,

  // Matches region end comment: // <# EndRegion #>
  regionEnd: /\/\/\s*<#\s*EndRegion\s*#>/,

  // Matches start node position: // <# start: { "pos-x": 123.4, "pos-y": 567.8 } #>
  startPosition: /\/\/\s*<#\s*start:\s*\{\s*"pos-x"\s*:\s*([-\d.]+)\s*,\s*"pos-y"\s*:\s*([-\d.]+)\s*\}\s*#>/,

  // Matches end node position: // <# end: { "pos-x": 123.4, "pos-y": 567.8 } #>
  endPosition: /\/\/\s*<#\s*end:\s*\{\s*"pos-x"\s*:\s*([-\d.]+)\s*,\s*"pos-y"\s*:\s*([-\d.]+)\s*\}\s*#>/,

  // Matches SetStoryFlag: ~ SetStoryFlag("flag_name")
  setStoryFlag: /~\s*SetStoryFlag\s*\(\s*"([^"]+)"\s*\)/,

  // Matches RemoveStoryFlag: ~ RemoveStoryFlag("flag_name")
  removeStoryFlag: /~\s*RemoveStoryFlag\s*\(\s*"([^"]+)"\s*\)/,

  // Matches GetStoryFlag check in conditional: - GetStoryFlag("flag_name"):
  getStoryFlagBranch: /^\s*-\s*GetStoryFlag\s*\(\s*"([^"]+)"\s*\)\s*:\s*$/,

  // Matches GetStoryFlag inline check with optional content and divert
  getStoryFlagInline: /^\s*-\s*GetStoryFlag\s*\(\s*"([^"]+)"\s*\)\s*:\s*(.*)$/,

  // Matches conditional block start: {
  conditionalStart: /^\s*\{\s*$/,

  // Matches conditional block end: }
  conditionalEnd: /^\s*\}\s*$/,

  // Matches else branch: - else:
  elseBranch: /^\s*-\s*else\s*:\s*$/,
};

/**
 * Remove comments from a line
 */
function stripComments(line: string): string {
  return line.replace(PATTERNS.comment, '').trim();
}

/**
 * Parse position from a comment line
 */
function parsePosition(line: string): NodePosition | null {
  const match = line.match(PATTERNS.positionComment);
  if (match) {
    return {
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
    };
  }
  return null;
}

/**
 * Parse a single choice line
 * Supports: * <label> text -> target (label is optional)
 */
function parseChoice(line: string, lineNumber: number): InkChoice | null {
  const match = line.match(PATTERNS.choice);
  if (!match) return null;

  const [, choiceType, label, bracketedText, unbracketedText, divertTarget] = match;
  const text = bracketedText || unbracketedText || '';

  return {
    text: text.trim(),
    lineNumber,
    divert: divertTarget,
    isSticky: choiceType === '+',
    rawContent: line,
    label: label?.trim(),
  };
}

/**
 * Parse an EXTERNAL declaration
 */
function parseExternal(line: string, lineNumber: number): InkExternal | null {
  const match = line.match(PATTERNS.external);
  if (!match) return null;

  const [, name, paramsStr] = match;
  const params = paramsStr
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return { name, params, lineNumber };
}

/**
 * Parse a SetStoryFlag operation
 */
function parseSetStoryFlag(line: string, lineNumber: number): InkStoryFlag | null {
  const match = line.match(PATTERNS.setStoryFlag);
  if (!match) return null;

  return {
    name: match[1],
    operation: 'set',
    lineNumber,
  };
}

/**
 * Parse a RemoveStoryFlag operation
 */
function parseRemoveStoryFlag(line: string, lineNumber: number): InkStoryFlag | null {
  const match = line.match(PATTERNS.removeStoryFlag);
  if (!match) return null;

  return {
    name: match[1],
    operation: 'remove',
    lineNumber,
  };
}

/**
 * Generate a preview from knot body content
 */
function generatePreview(bodyContent: string, maxLength: number = 50): string {
  // Get first non-empty, non-choice, non-divert line
  const lines = bodyContent.split('\n');
  for (const line of lines) {
    const trimmed = stripComments(line).trim();
    if (
      trimmed.length > 0 &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('+') &&
      !trimmed.match(/^\s*->/)
    ) {
      if (trimmed.length <= maxLength) {
        return trimmed;
      }
      return trimmed.substring(0, maxLength - 3) + '...';
    }
  }
  return '';
}

/**
 * Parse an ink file content into structured data
 */
export function parseInk(content: string): ParsedInk {
  const errors: InkParseError[] = [];
  const externals: InkExternal[] = [];
  const knots: InkKnot[] = [];
  const regions: InkRegion[] = [];
  let initialDivert: string | undefined;
  let startPosition: NodePosition | undefined;
  let endPosition: NodePosition | undefined;

  // Remove multi-line comments first
  const cleanedContent = content.replace(PATTERNS.multiLineComment, (match) => {
    // Replace with same number of newlines to preserve line numbers
    return match.split('\n').map(() => '').join('\n');
  });

  const lines = cleanedContent.split('\n');

  // First pass: find knot boundaries, regions, and collect externals/initial divert
  interface KnotBoundary {
    name: string;
    lineStart: number;
    lineEnd: number;
    regionName?: string;
  }
  interface RegionBoundary {
    name: string;
    lineStart: number;
    lineEnd: number;
    position?: NodePosition;
  }
  const knotBoundaries: KnotBoundary[] = [];
  const regionBoundaries: RegionBoundary[] = [];
  let inPreamble = true; // Before first knot
  let currentRegion: RegionBoundary | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const stripped = stripComments(line);

    // Check for region start comment (in original line, not stripped)
    const regionStartMatch = line.match(PATTERNS.regionStart);
    if (regionStartMatch) {
      // End previous region if any (shouldn't happen, but be safe)
      if (currentRegion) {
        currentRegion.lineEnd = lineNumber - 1;
        regionBoundaries.push(currentRegion);
      }

      // End any previous knot that's NOT in a region
      // (since it can't extend into this new region)
      if (knotBoundaries.length > 0) {
        const lastKnot = knotBoundaries[knotBoundaries.length - 1];
        if (!lastKnot.regionName) {
          lastKnot.lineEnd = lineNumber - 1;
        }
      }

      currentRegion = {
        name: regionStartMatch[1].trim(),
        lineStart: lineNumber,
        lineEnd: lines.length, // Will be updated
      };
      // Check next line for position comment
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const pos = parsePosition(nextLine);
        if (pos) {
          currentRegion.position = pos;
        }
      }
      continue;
    }

    // Check for region end comment (in original line, not stripped)
    const regionEndMatch = line.match(PATTERNS.regionEnd);
    if (regionEndMatch && currentRegion) {
      // End any knot that's part of this region
      if (knotBoundaries.length > 0) {
        const lastKnot = knotBoundaries[knotBoundaries.length - 1];
        // Only update if the last knot is in the current region
        if (lastKnot.regionName === currentRegion.name) {
          lastKnot.lineEnd = lineNumber - 1;
        }
      }
      currentRegion.lineEnd = lineNumber;
      regionBoundaries.push(currentRegion);
      currentRegion = null;
      continue;
    }

    // Check for knot header
    const knotMatch = stripped.match(PATTERNS.knot);
    if (knotMatch) {
      // End previous knot - but only if it's in the same region as the current one
      // AND its lineEnd hasn't already been set by a region boundary
      if (knotBoundaries.length > 0) {
        const lastKnot = knotBoundaries[knotBoundaries.length - 1];
        const lastKnotRegion = lastKnot.regionName;
        const currentKnotRegion = currentRegion?.name;
        // Only update if both in same region (or both outside any region)
        // AND lineEnd hasn't been set yet (still at default value)
        if (lastKnotRegion === currentKnotRegion && lastKnot.lineEnd === lines.length) {
          lastKnot.lineEnd = lineNumber - 1;
        }
      }

      // Start new knot
      knotBoundaries.push({
        name: knotMatch[1],
        lineStart: lineNumber,
        lineEnd: lines.length, // Will be updated
        regionName: currentRegion?.name,
      });

      inPreamble = false;
      continue;
    }

    // Handle preamble (before first knot)
    if (inPreamble) {
      // Check for start node position (use original line, not stripped)
      const startPosMatch = line.match(PATTERNS.startPosition);
      if (startPosMatch) {
        startPosition = {
          x: parseFloat(startPosMatch[1]),
          y: parseFloat(startPosMatch[2]),
        };
        continue;
      }

      // Check for end node position (use original line, not stripped)
      const endPosMatch = line.match(PATTERNS.endPosition);
      if (endPosMatch) {
        endPosition = {
          x: parseFloat(endPosMatch[1]),
          y: parseFloat(endPosMatch[2]),
        };
        continue;
      }

      if (stripped.length > 0) {
        // Check for EXTERNAL
        const ext = parseExternal(stripped, lineNumber);
        if (ext) {
          externals.push(ext);
          continue;
        }

        // Check for initial divert
        const divertMatch = stripped.match(PATTERNS.standaloneDivert);
        if (divertMatch && !initialDivert) {
          initialDivert = divertMatch[1];
          continue;
        }
      }
    }
  }

  // Close any unclosed region at end of file
  if (currentRegion) {
    currentRegion.lineEnd = lines.length;
    regionBoundaries.push(currentRegion);
  }

  // Second pass: parse each knot's content
  for (const boundary of knotBoundaries) {
    const knotLines = lines.slice(boundary.lineStart - 1, boundary.lineEnd);
    const fullContent = knotLines.join('\n');
    const bodyLines = knotLines.slice(1); // Exclude header
    const bodyContent = bodyLines.join('\n');

    const choices: InkChoice[] = [];
    const diverts: InkDivert[] = [];
    const storyFlags: InkStoryFlag[] = [];
    const conditionalBlocks: InkConditionalBlock[] = [];
    let position: NodePosition | undefined;

    // Track current choice context for multi-line choice blocks
    // When we see a choice, subsequent indented diverts belong to it
    let currentChoiceContext: { text: string; label?: string; indentLevel: number } | null = null;

    // Track conditional block parsing state
    let inConditionalBlock = false;
    let conditionalBlockStart = 0;
    let currentBranches: InkConditionalBranch[] = [];
    let currentElseDivert: string | undefined;

    // Parse lines within the knot
    for (let i = 0; i < bodyLines.length; i++) {
      const lineNumber = boundary.lineStart + 1 + i;
      const line = bodyLines[i];

      // Check for position comment (first line after header)
      if (i === 0) {
        const pos = parsePosition(line);
        if (pos) {
          position = pos;
          continue;
        }
      }

      const stripped = stripComments(line);
      if (stripped.length === 0) continue;

      // Calculate indentation level
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;

      // Check for SetStoryFlag
      const setFlagMatch = parseSetStoryFlag(stripped, lineNumber);
      if (setFlagMatch) {
        storyFlags.push(setFlagMatch);
        continue;
      }

      // Check for RemoveStoryFlag
      const removeFlagMatch = parseRemoveStoryFlag(stripped, lineNumber);
      if (removeFlagMatch) {
        storyFlags.push(removeFlagMatch);
        continue;
      }

      // Check for conditional block start: {
      if (PATTERNS.conditionalStart.test(stripped)) {
        inConditionalBlock = true;
        conditionalBlockStart = lineNumber;
        currentBranches = [];
        currentElseDivert = undefined;
        continue;
      }

      // Check for conditional block end: }
      if (PATTERNS.conditionalEnd.test(stripped) && inConditionalBlock) {
        conditionalBlocks.push({
          lineStart: conditionalBlockStart,
          lineEnd: lineNumber,
          branches: currentBranches,
          elseDivert: currentElseDivert,
        });
        inConditionalBlock = false;
        continue;
      }

      // Inside a conditional block, look for GetStoryFlag branches
      if (inConditionalBlock) {
        // Check for GetStoryFlag branch with inline content: - GetStoryFlag("flag"): content -> target
        const flagInlineMatch = stripped.match(PATTERNS.getStoryFlagInline);
        if (flagInlineMatch) {
          const flagName = flagInlineMatch[1];
          const restOfLine = flagInlineMatch[2].trim();

          // Check if there's a divert in the rest of the line (supports stitch diverts like knot.stitch)
          const divertInBranchMatch = restOfLine.match(/->\s*(\w+(?:\.\w+)?|END)/);
          const branchDivert = divertInBranchMatch ? divertInBranchMatch[1] : undefined;
          const branchContent = divertInBranchMatch
            ? restOfLine.replace(/->\s*(\w+(?:\.\w+)?|END)/, '').trim()
            : restOfLine;

          currentBranches.push({
            flagName,
            lineNumber,
            content: branchContent || undefined,
            divert: branchDivert,
          });

          // Also add as a conditional divert if there's a divert target
          if (branchDivert) {
            diverts.push({
              target: branchDivert,
              lineNumber,
              context: 'conditional',
              conditionFlag: flagName,
            });
          }

          // Record flag check operation (even if divert is on next line, we know there's a check)
          storyFlags.push({
            name: flagName,
            operation: 'check',
            lineNumber,
            divertTarget: branchDivert, // May be undefined if divert is on next line
          });
          continue;
        }

        // Check for else branch: - else:
        if (PATTERNS.elseBranch.test(stripped)) {
          // Look ahead for divert on next line or same line continuation
          // For now, we'll handle inline else with divert on next iteration
          continue;
        }

        // Check if we're in an else branch and this is a divert
        const standaloneDivertInConditional = stripped.match(PATTERNS.standaloneDivert);
        if (standaloneDivertInConditional) {
          // Check if previous non-empty line was an else branch
          let foundElse = false;
          for (let j = i - 1; j >= 0; j--) {
            const prevLine = stripComments(bodyLines[j]).trim();
            if (prevLine.length === 0) continue;
            if (PATTERNS.elseBranch.test(prevLine)) {
              foundElse = true;
            }
            break;
          }

          if (foundElse) {
            currentElseDivert = standaloneDivertInConditional[1];
            diverts.push({
              target: standaloneDivertInConditional[1],
              lineNumber,
              context: 'conditional',
              isElseBranch: true,
            });
          } else {
            // Check if this is content after a GetStoryFlag branch
            // Look for the most recent branch that doesn't have a divert yet
            const lastBranch = currentBranches[currentBranches.length - 1];
            if (lastBranch && !lastBranch.divert) {
              lastBranch.divert = standaloneDivertInConditional[1];
              diverts.push({
                target: standaloneDivertInConditional[1],
                lineNumber,
                context: 'conditional',
                conditionFlag: lastBranch.flagName,
              });

              // Update the storyFlag check with the divert target
              const checkFlag = storyFlags.find(
                f => f.operation === 'check' && f.name === lastBranch.flagName && !f.divertTarget
              );
              if (checkFlag) {
                checkFlag.divertTarget = standaloneDivertInConditional[1];
              }
            }
          }
          continue;
        }

        // Regular content inside conditional - could be branch content
        continue;
      }

      // Check for choices
      const choice = parseChoice(stripped, lineNumber);
      if (choice) {
        choices.push(choice);
        if (choice.divert) {
          diverts.push({
            target: choice.divert,
            lineNumber,
            context: 'choice',
            choiceText: choice.text,
            choiceLabel: choice.label,
          });
          // Choice has inline divert, so no pending choice context
          currentChoiceContext = null;
        } else {
          // Choice without inline divert - set as current context for subsequent diverts
          currentChoiceContext = {
            text: choice.text,
            label: choice.label,
            indentLevel: leadingSpaces,
          };
        }
        continue;
      }

      // Check for standalone divert
      const standaloneDivertMatch = stripped.match(PATTERNS.standaloneDivert);
      if (standaloneDivertMatch) {
        // Check if this divert is indented more than the choice (belongs to choice block)
        if (currentChoiceContext && leadingSpaces > currentChoiceContext.indentLevel) {
          diverts.push({
            target: standaloneDivertMatch[1],
            lineNumber,
            context: 'choice',
            choiceText: currentChoiceContext.text,
            choiceLabel: currentChoiceContext.label,
          });
          // Update the choice's divert property so validation recognizes it has a divert
          // Search from the end to find the most recent choice with matching text
          for (let j = choices.length - 1; j >= 0; j--) {
            const c = choices[j];
            if (c.text === currentChoiceContext!.text && !c.divert) {
              c.divert = standaloneDivertMatch[1];
              break;
            }
          }
          // After a divert, this choice block is done
          currentChoiceContext = null;
        } else {
          // Not indented or no choice context - standalone divert
          diverts.push({
            target: standaloneDivertMatch[1],
            lineNumber,
            context: 'standalone',
          });
          // Reset choice context on non-indented divert
          currentChoiceContext = null;
        }
        continue;
      }

      // Non-choice, non-divert content
      // If indented more than choice, it's part of choice block (keep context)
      // If at same or lower indent, reset choice context
      if (currentChoiceContext && leadingSpaces <= currentChoiceContext.indentLevel) {
        currentChoiceContext = null;
      }

      // Check for inline diverts
      const divertRegex = new RegExp(PATTERNS.divert.source, 'g');
      let divertMatch;
      while ((divertMatch = divertRegex.exec(stripped)) !== null) {
        // Make sure this isn't already captured as a choice divert
        const alreadyCaptured = diverts.some(
          d => d.lineNumber === lineNumber && d.target === divertMatch![1]
        );
        if (!alreadyCaptured) {
          diverts.push({
            target: divertMatch[1],
            lineNumber,
            context: 'inline',
          });
        }
      }
    }

    knots.push({
      name: boundary.name,
      lineStart: boundary.lineStart,
      lineEnd: boundary.lineEnd,
      content: fullContent,
      bodyContent,
      choices,
      diverts,
      position,
      regionName: boundary.regionName,
      storyFlags,
      conditionalBlocks,
    });
  }

  // Build region objects with their knot names
  for (const regionBoundary of regionBoundaries) {
    const regionKnotNames = knots
      .filter(k => k.regionName === regionBoundary.name)
      .map(k => k.name);

    regions.push({
      name: regionBoundary.name,
      lineStart: regionBoundary.lineStart,
      lineEnd: regionBoundary.lineEnd,
      position: regionBoundary.position,
      knotNames: regionKnotNames,
    });
  }

  // Validation: check for undefined divert targets
  const knotNames = new Set(knots.map(k => k.name));
  knotNames.add('END'); // END is always valid

  // Check initial divert
  if (initialDivert && !knotNames.has(initialDivert)) {
    errors.push({
      message: `Initial divert target '${initialDivert}' is not defined`,
      lineNumber: 1,
      severity: 'error',
    });
  }

  // Check each knot's diverts
  for (const knot of knots) {
    for (const divert of knot.diverts) {
      // For stitch diverts (e.g., "knot.stitch"), validate the knot part only
      // The stitch itself is internal to the knot and can't be easily validated here
      const targetToCheck = divert.target.includes('.')
        ? divert.target.split('.')[0]
        : divert.target;

      if (!knotNames.has(targetToCheck)) {
        errors.push({
          message: `Divert target '${divert.target}' is not defined`,
          lineNumber: divert.lineNumber,
          severity: 'error',
        });
      }
    }

    // Check for dangling choices (choices without diverts)
    for (const choice of knot.choices) {
      if (!choice.divert) {
        errors.push({
          message: `Dangling choice '${choice.text.slice(0, 30)}${choice.text.length > 30 ? '...' : ''}' has no divert target`,
          lineNumber: choice.lineNumber,
          severity: 'error',
        });
      }
    }

    // Check for duplicate knot names
    const duplicates = knots.filter(k => k.name === knot.name);
    if (duplicates.length > 1) {
      errors.push({
        message: `Duplicate knot name '${knot.name}'`,
        lineNumber: knot.lineStart,
        severity: 'error',
      });
    }

    // Warning for empty knots (excluding position comments)
    const contentWithoutPosition = knot.bodyContent
      .split('\n')
      .filter(line => !parsePosition(line))
      .join('\n')
      .trim();
    if (contentWithoutPosition.length === 0) {
      errors.push({
        message: `Knot '${knot.name}' is empty`,
        lineNumber: knot.lineStart,
        severity: 'warning',
      });
    }
  }

  // Deduplicate duplicate knot errors (only report once per name)
  const seenDuplicates = new Set<string>();
  const deduplicatedErrors = errors.filter(err => {
    if (err.message.startsWith('Duplicate knot name')) {
      const name = err.message.match(/'([^']+)'/)?.[1];
      if (name && seenDuplicates.has(name)) {
        return false;
      }
      if (name) seenDuplicates.add(name);
    }
    return true;
  });

  // Collect all unique story flag names across all knots
  const allStoryFlagsSet = new Set<string>();
  for (const knot of knots) {
    for (const flag of knot.storyFlags) {
      allStoryFlagsSet.add(flag.name);
    }
  }
  const allStoryFlags = Array.from(allStoryFlagsSet).sort();

  return {
    knots,
    regions,
    externals,
    initialDivert,
    errors: deduplicatedErrors,
    rawContent: content,
    startPosition,
    endPosition,
    allStoryFlags,
  };
}

/**
 * Get a preview string for a knot
 */
export function getKnotPreview(knot: InkKnot): string {
  return generatePreview(knot.bodyContent);
}

/**
 * Check if a knot has errors
 */
export function knotHasErrors(knot: InkKnot, parsedInk: ParsedInk): boolean {
  return parsedInk.errors.some(
    err => err.severity === 'error' &&
           err.lineNumber >= knot.lineStart &&
           err.lineNumber <= knot.lineEnd
  );
}

/**
 * Available method definition for validation
 */
export interface AvailableMethod {
  name: string;
  params: string[];
  description?: string;
}

/**
 * Validate external function declarations against available methods
 * Returns additional errors and warnings to be merged with parsedInk.errors
 */
export function validateExternals(
  parsedInk: ParsedInk,
  availableMethods: AvailableMethod[]
): InkParseError[] {
  const errors: InkParseError[] = [];
  const availableByName = new Map(availableMethods.map(m => [m.name, m]));
  const importedNames = new Set(parsedInk.externals.map(e => e.name));

  // Check for unknown external functions (declared but not in available methods)
  for (const external of parsedInk.externals) {
    if (!availableByName.has(external.name)) {
      errors.push({
        message: `Unknown external function '${external.name}' - not found in available methods`,
        lineNumber: external.lineNumber,
        severity: 'warning',
      });
    }
  }

  // Build a regex pattern to find function calls
  // Matches: FunctionName( or ~ FunctionName(
  const functionCallPattern = /(?:^|~\s*)(\w+)\s*\(/gm;

  // Scan all knots for function calls that aren't imported
  for (const knot of parsedInk.knots) {
    const lines = knot.bodyContent.split('\n');
    let lineOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = knot.lineStart + 1 + i; // +1 for knot header

      let match;
      functionCallPattern.lastIndex = 0;
      while ((match = functionCallPattern.exec(line)) !== null) {
        const funcName = match[1];

        // Check if this is an available method that's being called but not imported
        if (availableByName.has(funcName) && !importedNames.has(funcName)) {
          errors.push({
            message: `External function '${funcName}' is used but not imported - add EXTERNAL ${funcName}(${availableByName.get(funcName)!.params.join(', ')})`,
            lineNumber,
            severity: 'error',
          });
        }
      }
    }
  }

  // Also check the preamble (before first knot) for function calls
  // This is less common but could happen in conditionals
  const firstKnotStart = parsedInk.knots[0]?.lineStart ?? parsedInk.rawContent.split('\n').length;
  const preambleLines = parsedInk.rawContent.split('\n').slice(0, firstKnotStart - 1);

  for (let i = 0; i < preambleLines.length; i++) {
    const line = preambleLines[i];
    const lineNumber = i + 1;

    // Skip EXTERNAL declarations and comments
    if (line.trim().startsWith('EXTERNAL') || line.trim().startsWith('//')) {
      continue;
    }

    let match;
    functionCallPattern.lastIndex = 0;
    while ((match = functionCallPattern.exec(line)) !== null) {
      const funcName = match[1];

      if (availableByName.has(funcName) && !importedNames.has(funcName)) {
        errors.push({
          message: `External function '${funcName}' is used but not imported - add EXTERNAL ${funcName}(${availableByName.get(funcName)!.params.join(', ')})`,
          lineNumber,
          severity: 'error',
        });
      }
    }
  }

  // Deduplicate errors by message and line number
  const seen = new Set<string>();
  return errors.filter(err => {
    const key = `${err.lineNumber}:${err.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
