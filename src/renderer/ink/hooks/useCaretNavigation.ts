/**
 * useCaretNavigation Hook
 *
 * Manages caret position for tree-structured content navigation.
 * Supports navigating into/out of nested choice content.
 */

import { useState, useCallback, useMemo } from 'react';
import type { KnotContentItem, ChoiceContentItem } from '../parser/inkTypes';

/**
 * Represents a position in the content tree.
 * - parentId: null for root level, or the ID of a choice containing nested content
 * - afterIndex: insert after this index (-1 = at start, items.length-1 = at end)
 */
export interface CaretPosition {
  /** Parent choice ID, or null for root level */
  parentId: string | null;
  /** Insert after item at this index (-1 means at the very start) */
  afterIndex: number;
}

/**
 * Flattened view of an item with its path info for rendering
 */
export interface FlattenedItem {
  item: KnotContentItem;
  depth: number;
  parentId: string | null;
  indexInParent: number;
  isLastInParent: boolean;
}

/**
 * Get the items array at a given parent level
 */
export function getItemsAtLevel(
  items: KnotContentItem[],
  parentId: string | null
): KnotContentItem[] {
  if (parentId === null) {
    return items;
  }

  // Find the parent choice
  const findChoice = (items: KnotContentItem[]): ChoiceContentItem | null => {
    for (const item of items) {
      if (item.id === parentId && item.type === 'choice') {
        return item;
      }
      if (item.type === 'choice' && item.nestedContent) {
        const found = findChoice(item.nestedContent);
        if (found) return found;
      }
    }
    return null;
  };

  const choice = findChoice(items);
  return choice?.nestedContent || [];
}

/**
 * Find an item by ID in the tree
 */
export function findItemById(
  items: KnotContentItem[],
  id: string
): { item: KnotContentItem; parentId: string | null; index: number } | null {
  // Check root level
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.id === id) {
      return { item, parentId: null, index: i };
    }
    // Check nested content
    if (item.type === 'choice' && item.nestedContent) {
      const nested = item.nestedContent;
      for (let j = 0; j < nested.length; j++) {
        if (nested[j].id === id) {
          return { item: nested[j], parentId: item.id, index: j };
        }
      }
    }
  }
  return null;
}

/**
 * Get the parent choice ID for an item
 */
export function getParentId(
  items: KnotContentItem[],
  itemId: string
): string | null {
  const found = findItemById(items, itemId);
  return found?.parentId ?? null;
}

/**
 * Check if an item has nested content capability (is a choice)
 */
export function canHaveNestedContent(item: KnotContentItem): item is ChoiceContentItem {
  return item.type === 'choice';
}

/**
 * Flatten the tree for rendering with depth info
 */
export function flattenItems(items: KnotContentItem[]): FlattenedItem[] {
  const result: FlattenedItem[] = [];

  const flatten = (
    items: KnotContentItem[],
    depth: number,
    parentId: string | null
  ) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      result.push({
        item,
        depth,
        parentId,
        indexInParent: i,
        isLastInParent: i === items.length - 1,
      });

      // Recurse into nested content
      if (item.type === 'choice' && item.nestedContent && item.nestedContent.length > 0) {
        flatten(item.nestedContent, depth + 1, item.id);
      }
    }
  };

  flatten(items, 0, null);
  return result;
}

/**
 * Hook for managing caret navigation in tree-structured content
 */
export function useCaretNavigation(items: KnotContentItem[]) {
  // Caret position state
  const [caret, setCaret] = useState<CaretPosition>({
    parentId: null,
    afterIndex: items.length - 1,
  });

  // Flattened items for easy traversal
  const flatItems = useMemo(() => flattenItems(items), [items]);

  // Get items at current caret level
  const currentLevelItems = useMemo(
    () => getItemsAtLevel(items, caret.parentId),
    [items, caret.parentId]
  );

  // Move caret up (Alt+Up)
  const moveCaretUp = useCallback(() => {
    setCaret((prev) => {
      const levelItems = getItemsAtLevel(items, prev.parentId);
      if (prev.afterIndex > -1) {
        return { ...prev, afterIndex: prev.afterIndex - 1 };
      }
      return prev;
    });
  }, [items]);

  // Move caret down (Alt+Down)
  const moveCaretDown = useCallback(() => {
    setCaret((prev) => {
      const levelItems = getItemsAtLevel(items, prev.parentId);
      if (prev.afterIndex < levelItems.length - 1) {
        return { ...prev, afterIndex: prev.afterIndex + 1 };
      }
      return prev;
    });
  }, [items]);

  // Move caret out of nested content (Alt+Left)
  const moveCaretOut = useCallback(() => {
    setCaret((prev) => {
      if (prev.parentId === null) {
        // Already at root level
        return prev;
      }

      // Find the parent choice in the root items
      const parentFound = findItemById(items, prev.parentId);
      if (parentFound) {
        return {
          parentId: parentFound.parentId,
          afterIndex: parentFound.index,
        };
      }
      return prev;
    });
  }, [items]);

  // Move caret into nested content of a choice (Alt+Right)
  const moveCaretIn = useCallback(() => {
    setCaret((prev) => {
      const levelItems = getItemsAtLevel(items, prev.parentId);
      // afterIndex points to the item after which caret sits
      // We want to enter the item AT afterIndex (if it's a choice)
      if (prev.afterIndex >= 0 && prev.afterIndex < levelItems.length) {
        const targetItem = levelItems[prev.afterIndex];
        if (canHaveNestedContent(targetItem)) {
          // Enter this choice's nested content
          const nestedLength = targetItem.nestedContent?.length || 0;
          return {
            parentId: targetItem.id,
            afterIndex: nestedLength - 1, // At end of nested content
          };
        }
      }
      return prev;
    });
  }, [items]);

  // Set caret to be after a specific item
  const setCaretAfterItem = useCallback((itemId: string) => {
    const found = findItemById(items, itemId);
    if (found) {
      setCaret({
        parentId: found.parentId,
        afterIndex: found.index,
      });
    }
  }, [items]);

  // Set caret to end of root level
  const setCaretToEnd = useCallback(() => {
    setCaret({
      parentId: null,
      afterIndex: items.length - 1,
    });
  }, [items.length]);

  // Get the insertion position for adding new items
  const getInsertPosition = useCallback((): {
    parentId: string | null;
    index: number;
  } => {
    return {
      parentId: caret.parentId,
      index: caret.afterIndex + 1,
    };
  }, [caret]);

  // Check if we're inside a choice's nested content
  const isInsideChoice = caret.parentId !== null;

  // Get the ID of the item the caret is positioned after (or null if at start)
  const caretAfterItemId = useMemo(() => {
    const levelItems = getItemsAtLevel(items, caret.parentId);
    if (caret.afterIndex >= 0 && caret.afterIndex < levelItems.length) {
      return levelItems[caret.afterIndex].id;
    }
    return null;
  }, [items, caret]);

  return {
    caret,
    setCaret,
    moveCaretUp,
    moveCaretDown,
    moveCaretIn,
    moveCaretOut,
    setCaretAfterItem,
    setCaretToEnd,
    getInsertPosition,
    isInsideChoice,
    caretAfterItemId,
    flatItems,
    currentLevelItems,
  };
}

export default useCaretNavigation;
