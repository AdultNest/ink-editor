/**
 * Diff Utilities
 *
 * Functions for computing and applying content deltas.
 * Uses a simple diff algorithm suitable for text content.
 */

import type { ContentDelta, DiffOp } from './historyTypes';

/**
 * Compute a simple hash of the content for validation.
 * Uses a fast string hash algorithm.
 */
export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Find the longest common prefix length between two strings.
 */
function commonPrefixLength(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  let i = 0;
  while (i < minLen && a[i] === b[i]) {
    i++;
  }
  return i;
}

/**
 * Find the longest common suffix length between two strings,
 * not overlapping with the common prefix.
 */
function commonSuffixLength(a: string, b: string, prefixLen: number): number {
  const minLen = Math.min(a.length - prefixLen, b.length - prefixLen);
  let i = 0;
  while (i < minLen && a[a.length - 1 - i] === b[b.length - 1 - i]) {
    i++;
  }
  return i;
}

/**
 * Compute minimal diff operations between two strings.
 * Returns forward delta (before -> after) and backward delta (after -> before).
 */
export function computeDeltas(before: string, after: string): {
  forward: ContentDelta;
  backward: ContentDelta;
} {
  const beforeHash = hashContent(before);
  const afterHash = hashContent(after);

  // Identical content - no changes
  if (before === after) {
    return {
      forward: { ops: [{ type: 'retain', count: before.length }], beforeHash, afterHash },
      backward: { ops: [{ type: 'retain', count: after.length }], beforeHash: afterHash, afterHash: beforeHash },
    };
  }

  // Find common prefix and suffix
  const prefixLen = commonPrefixLength(before, after);
  const suffixLen = commonSuffixLength(before, after, prefixLen);

  // Extract the changed regions
  const beforeChanged = before.slice(prefixLen, before.length - suffixLen || undefined);
  const afterChanged = after.slice(prefixLen, after.length - suffixLen || undefined);

  // Build forward delta operations
  const forwardOps: DiffOp[] = [];
  if (prefixLen > 0) {
    forwardOps.push({ type: 'retain', count: prefixLen });
  }
  if (beforeChanged.length > 0) {
    forwardOps.push({ type: 'delete', count: beforeChanged.length });
  }
  if (afterChanged.length > 0) {
    forwardOps.push({ type: 'insert', text: afterChanged });
  }
  if (suffixLen > 0) {
    forwardOps.push({ type: 'retain', count: suffixLen });
  }

  // Build backward delta operations
  const backwardOps: DiffOp[] = [];
  if (prefixLen > 0) {
    backwardOps.push({ type: 'retain', count: prefixLen });
  }
  if (afterChanged.length > 0) {
    backwardOps.push({ type: 'delete', count: afterChanged.length });
  }
  if (beforeChanged.length > 0) {
    backwardOps.push({ type: 'insert', text: beforeChanged });
  }
  if (suffixLen > 0) {
    backwardOps.push({ type: 'retain', count: suffixLen });
  }

  return {
    forward: {
      ops: forwardOps.length > 0 ? forwardOps : [{ type: 'retain', count: 0 }],
      beforeHash,
      afterHash,
    },
    backward: {
      ops: backwardOps.length > 0 ? backwardOps : [{ type: 'retain', count: 0 }],
      beforeHash: afterHash,
      afterHash: beforeHash,
    },
  };
}

/**
 * Apply a delta to transform content.
 * Throws if the content hash doesn't match the expected beforeHash.
 */
export function applyDelta(content: string, delta: ContentDelta): string {
  const contentHash = hashContent(content);
  if (contentHash !== delta.beforeHash) {
    throw new Error(
      `Content hash mismatch: expected ${delta.beforeHash}, got ${contentHash}`
    );
  }

  let result = '';
  let cursor = 0;

  for (const op of delta.ops) {
    switch (op.type) {
      case 'retain':
        result += content.slice(cursor, cursor + op.count);
        cursor += op.count;
        break;
      case 'delete':
        cursor += op.count;
        break;
      case 'insert':
        result += op.text;
        break;
    }
  }

  // Append any remaining content (in case delta doesn't cover entire string)
  if (cursor < content.length) {
    result += content.slice(cursor);
  }

  return result;
}

/**
 * Validate that a delta can be applied to the given content.
 */
export function canApplyDelta(content: string, delta: ContentDelta): boolean {
  return hashContent(content) === delta.beforeHash;
}
