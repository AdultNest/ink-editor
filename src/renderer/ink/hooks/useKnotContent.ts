/**
 * useKnotContent Hook
 *
 * Manages structured knot content for the visual editor.
 * Handles parsing, editing, and serialization of knot content.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type {
  KnotContentItem,
  KnotContentItemType,
  NodePosition,
} from '../parser/inkTypes';
import { parseKnotContent, createDefaultItem } from '../parser/knotContentParser';
import {
  serializeKnotContent,
  serializeWithValidation,
} from '../parser/knotContentSerializer';
import { MediaValidator } from '../parser/mediaValidator';

/**
 * Validation error from serialization
 */
export interface ContentValidationError {
  itemId: string;
  message: string;
}

/**
 * Insert position for nested content support
 */
export interface InsertPosition {
  /** Parent choice ID, or null for root level */
  parentId: string | null;
  /** Index to insert at */
  index: number;
}

/**
 * Return type for useKnotContent hook
 */
export interface UseKnotContentResult {
  /** The current content items */
  items: KnotContentItem[];

  /** Add a new item of the specified type */
  addItem: (type: KnotContentItemType, position?: number) => string;

  /** Add a new item at a specific position (supports nested content) */
  addItemAt: (type: KnotContentItemType, position: InsertPosition) => string;

  /** Add a text message with content */
  addTextMessage: (content: string, position?: number) => string;

  /** Add a text message at a specific position (supports nested content) */
  addTextMessageAt: (content: string, position: InsertPosition) => string;

  /** Add a choice (single prompt) with text */
  addChoiceMessage: (text: string, position?: number) => string;

  /** Update an existing item (searches tree recursively) */
  updateItem: (id: string, updates: Partial<KnotContentItem>) => void;

  /** Delete an item (searches tree recursively) */
  deleteItem: (id: string) => void;

  /** Move an item up in the list */
  moveItemUp: (id: string) => void;

  /** Move an item down in the list */
  moveItemDown: (id: string) => void;

  /** Reorder items (for drag-drop) */
  reorderItems: (sourceIndex: number, destIndex: number) => void;

  /** Serialize items back to ink content */
  serialize: () => string;

  /** Serialize with validation */
  serializeWithErrors: () => { content: string; errors: string[] };

  /** Validation errors from current content */
  validationErrors: ContentValidationError[];

  /** Whether the content has been modified */
  isDirty: boolean;

  /** Reset dirty flag */
  resetDirty: () => void;

  /** Replace all items (e.g., after external content change) */
  setItems: (items: KnotContentItem[]) => void;

  /** Reset to original content */
  reset: () => void;
}

/**
 * Options for useKnotContent hook
 */
export interface UseKnotContentOptions {
  /** Initial body content to parse */
  initialContent: string;
  /** Project path for media validation */
  projectPath: string;
  /** Position to preserve in serialization */
  knotPosition?: NodePosition;
  /** Callback when content changes */
  onChange?: (items: KnotContentItem[]) => void;
}

/**
 * useKnotContent hook
 *
 * Manages the structured content of a knot for visual editing.
 */
export function useKnotContent({
  initialContent,
  projectPath,
  knotPosition,
  onChange,
}: UseKnotContentOptions): UseKnotContentResult {
  // Parse initial content
  const initialItems = useMemo(
    () => parseKnotContent(initialContent),
    [initialContent]
  );

  // State
  const [items, setItemsState] = useState<KnotContentItem[]>(initialItems);
  const [isDirty, setIsDirty] = useState(false);

  // Media validator for file validation
  const validator = useMemo(
    () => new MediaValidator(projectPath),
    [projectPath]
  );

  // Update items when initial content changes (e.g., switching knots)
  useEffect(() => {
    const newItems = parseKnotContent(initialContent);
    setItemsState(newItems);
    setIsDirty(false);
  }, [initialContent]);

  // Notify parent of changes
  useEffect(() => {
    if (isDirty && onChange) {
      onChange(items);
    }
  }, [items, isDirty, onChange]);

  // Set items with dirty tracking
  const setItems = useCallback((newItems: KnotContentItem[]) => {
    setItemsState(newItems);
    setIsDirty(true);
  }, []);

  // Helper: Insert item into nested structure
  const insertIntoTree = (
    items: KnotContentItem[],
    newItem: KnotContentItem,
    position: InsertPosition
  ): KnotContentItem[] => {
    if (position.parentId === null) {
      // Insert at root level
      const newItems = [...items];
      newItems.splice(position.index, 0, newItem);
      return newItems;
    }

    // Insert into nested content of a choice
    return items.map((item) => {
      if (item.id === position.parentId && item.type === 'choice') {
        const nestedContent = [...(item.nestedContent || [])];
        nestedContent.splice(position.index, 0, newItem);
        return { ...item, nestedContent };
      }
      // Recurse into nested content
      if (item.type === 'choice' && item.nestedContent) {
        return {
          ...item,
          nestedContent: insertIntoTree(item.nestedContent, newItem, position),
        };
      }
      return item;
    });
  };

  // Add a new item (returns the item ID) - root level only
  const addItem = useCallback(
    (type: KnotContentItemType, position?: number): string => {
      const newItem = createDefaultItem(type);
      setItemsState((prev) => {
        const newItems = [...prev];
        const insertAt = position ?? newItems.length;
        newItems.splice(insertAt, 0, newItem);
        return newItems;
      });
      setIsDirty(true);
      return newItem.id;
    },
    []
  );

  // Add a new item at a specific position (supports nested content)
  const addItemAt = useCallback(
    (type: KnotContentItemType, position: InsertPosition): string => {
      const newItem = createDefaultItem(type);
      setItemsState((prev) => insertIntoTree(prev, newItem, position));
      setIsDirty(true);
      return newItem.id;
    },
    []
  );

  // Add a text message with content - root level only
  const addTextMessage = useCallback(
    (content: string, position?: number): string => {
      const newItem = createDefaultItem('text');
      (newItem as { content: string }).content = content;
      setItemsState((prev) => {
        const newItems = [...prev];
        const insertAt = position ?? newItems.length;
        newItems.splice(insertAt, 0, newItem);
        return newItems;
      });
      setIsDirty(true);
      return newItem.id;
    },
    []
  );

  // Add a text message at a specific position (supports nested content)
  const addTextMessageAt = useCallback(
    (content: string, position: InsertPosition): string => {
      const newItem = createDefaultItem('text');
      (newItem as { content: string }).content = content;
      setItemsState((prev) => insertIntoTree(prev, newItem, position));
      setIsDirty(true);
      return newItem.id;
    },
    []
  );

  // Add a choice with text (single prompt style)
  const addChoiceMessage = useCallback(
    (text: string, position?: number): string => {
      const newItem = createDefaultItem('choice');
      (newItem as { text: string }).text = text;
      setItemsState((prev) => {
        const newItems = [...prev];
        const insertAt = position ?? newItems.length;
        newItems.splice(insertAt, 0, newItem);
        return newItems;
      });
      setIsDirty(true);
      return newItem.id;
    },
    []
  );

  // Helper: Update item in tree recursively
  const updateInTree = (
    items: KnotContentItem[],
    id: string,
    updates: Partial<KnotContentItem>
  ): KnotContentItem[] => {
    return items.map((item) => {
      if (item.id === id) {
        return { ...item, ...updates } as KnotContentItem;
      }
      // Recurse into nested content
      if (item.type === 'choice' && item.nestedContent) {
        return {
          ...item,
          nestedContent: updateInTree(item.nestedContent, id, updates),
        };
      }
      return item;
    });
  };

  // Helper: Delete item from tree recursively
  const deleteFromTree = (
    items: KnotContentItem[],
    id: string
  ): KnotContentItem[] => {
    return items
      .filter((item) => item.id !== id)
      .map((item) => {
        // Recurse into nested content
        if (item.type === 'choice' && item.nestedContent) {
          return {
            ...item,
            nestedContent: deleteFromTree(item.nestedContent, id),
          };
        }
        return item;
      });
  };

  // Helper: Update stitch diverts when a stitch is renamed
  const updateStitchDiverts = (
    items: KnotContentItem[],
    oldStitchName: string,
    newStitchName: string
  ): KnotContentItem[] => {
    return items.map((item) => {
      if (item.type === 'choice' && item.divert) {
        // Check if this choice diverts to the old stitch (format: knot.stitch or just .stitch)
        if (item.divert.endsWith(`.${oldStitchName}`)) {
          const prefix = item.divert.slice(0, -oldStitchName.length);
          return { ...item, divert: `${prefix}${newStitchName}` };
        }
      }
      // Recurse into nested content
      if (item.type === 'choice' && item.nestedContent) {
        return {
          ...item,
          nestedContent: updateStitchDiverts(item.nestedContent, oldStitchName, newStitchName),
        };
      }
      return item;
    });
  };

  // Update an existing item (searches tree recursively)
  // Also updates choice diverts when a stitch is renamed
  const updateItem = useCallback(
    (id: string, updates: Partial<KnotContentItem>) => {
      setItemsState((prev) => {
        // Find the item being updated to check if it's a stitch rename
        const findItem = (items: KnotContentItem[]): KnotContentItem | null => {
          for (const item of items) {
            if (item.id === id) return item;
            if (item.type === 'choice' && item.nestedContent) {
              const found = findItem(item.nestedContent);
              if (found) return found;
            }
          }
          return null;
        };

        const targetItem = findItem(prev);
        let updatedItems = updateInTree(prev, id, updates);

        // If renaming a stitch, also update all diverts pointing to it
        if (
          targetItem?.type === 'stitch' &&
          'name' in updates &&
          updates.name !== targetItem.name
        ) {
          updatedItems = updateStitchDiverts(
            updatedItems,
            targetItem.name,
            updates.name as string
          );
        }

        return updatedItems;
      });
      setIsDirty(true);
    },
    []
  );

  // Delete an item (searches tree recursively)
  const deleteItem = useCallback((id: string) => {
    setItemsState((prev) => deleteFromTree(prev, id));
    setIsDirty(true);
  }, []);

  // Move item up
  const moveItemUp = useCallback((id: string) => {
    setItemsState((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index <= 0) return prev;
      const newItems = [...prev];
      [newItems[index - 1], newItems[index]] = [
        newItems[index],
        newItems[index - 1],
      ];
      return newItems;
    });
    setIsDirty(true);
  }, []);

  // Move item down
  const moveItemDown = useCallback((id: string) => {
    setItemsState((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index < 0 || index >= prev.length - 1) return prev;
      const newItems = [...prev];
      [newItems[index], newItems[index + 1]] = [
        newItems[index + 1],
        newItems[index],
      ];
      return newItems;
    });
    setIsDirty(true);
  }, []);

  // Reorder items (for drag-drop)
  const reorderItems = useCallback(
    (sourceIndex: number, destIndex: number) => {
      if (sourceIndex === destIndex) return;

      setItemsState((prev) => {
        const newItems = [...prev];
        const [removed] = newItems.splice(sourceIndex, 1);
        newItems.splice(destIndex, 0, removed);
        return newItems;
      });
      setIsDirty(true);
    },
    []
  );

  // Serialize to ink content
  const serialize = useCallback(() => {
    return serializeKnotContent(items, knotPosition);
  }, [items, knotPosition]);

  // Serialize with validation
  const serializeWithErrors = useCallback(() => {
    return serializeWithValidation(items, knotPosition);
  }, [items, knotPosition]);

  // Compute validation errors
  const validationErrors = useMemo(() => {
    const errors: ContentValidationError[] = [];

    for (const item of items) {
      switch (item.type) {
        case 'image':
        case 'player-image':
          if (!item.filename) {
            errors.push({
              itemId: item.id,
              message: 'Image filename is required',
            });
          }
          break;
        case 'video':
        case 'player-video':
          if (!item.filename) {
            errors.push({
              itemId: item.id,
              message: 'Video filename is required',
            });
          }
          break;
        case 'side-story':
          if (!item.storyName) {
            errors.push({
              itemId: item.id,
              message: 'Side story name is required',
            });
          }
          break;
        case 'flag-operation':
          if (!item.flagName) {
            errors.push({
              itemId: item.id,
              message: 'Flag name is required',
            });
          }
          break;
        case 'choice':
          if (!item.text) {
            errors.push({
              itemId: item.id,
              message: 'Choice text is required',
            });
          }
          // Note: Divert validation is done at apply time, not during editing
          // This allows users to create choices and add content before setting the divert
          break;
        case 'divert':
          if (!item.target) {
            errors.push({
              itemId: item.id,
              message: 'Divert target is required',
            });
          }
          break;
        case 'stitch':
          if (!item.name) {
            errors.push({
              itemId: item.id,
              message: 'Stitch name is required',
            });
          }
          break;
      }
    }

    return errors;
  }, [items]);

  // Reset dirty flag
  const resetDirty = useCallback(() => {
    setIsDirty(false);
  }, []);

  // Reset to original content
  const reset = useCallback(() => {
    const newItems = parseKnotContent(initialContent);
    setItemsState(newItems);
    setIsDirty(false);
  }, [initialContent]);

  return {
    items,
    addItem,
    addItemAt,
    addTextMessage,
    addTextMessageAt,
    addChoiceMessage,
    updateItem,
    deleteItem,
    moveItemUp,
    moveItemDown,
    reorderItems,
    serialize,
    serializeWithErrors,
    validationErrors,
    isDirty,
    resetDirty,
    setItems,
    reset,
  };
}

export default useKnotContent;
