/**
 * useInkEditor hook
 *
 * State management for the Ink editor, including:
 * - File loading and saving
 * - Parsing ink content
 * - Converting parsed content to React Flow nodes/edges
 * - Selection management
 * - View mode toggling
 * - Node position persistence
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Node, Edge, NodeChange, XYPosition } from '@xyflow/react';
import {
  type ParsedInk,
  type InkKnot,
  type NodePosition,
  parseInk,
  knotHasErrors,
  updateKnotContent,
  addKnot,
  deleteKnot,
  addDivert,
  removeDivert,
  updateDivert,
  updateKnotPositions,
  updateRegionPositions,
  moveKnotToRegion,
  stripPositionComment,
  addRegion,
  renameKnot,
  renameRegion,
  updateStartPosition,
  updateEndPosition,
} from '../parser';
import type { KnotNodeData, StartNodeData, EndNodeData, RegionNodeData, InkRegion, InkStoryFlag } from '../parser/inkTypes';
import { calculateLayout, type LayoutAlgorithm } from '../layout';

export type ViewMode = 'graph' | 'raw';

export interface UseInkEditorResult {
  // State
  rawContent: string;
  parsedInk: ParsedInk | null;
  viewMode: ViewMode;
  selectedKnotId: string | null;
  selectedKnot: InkKnot | null;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;

  // Graph data
  nodes: Node[];
  edges: Edge[];

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setSelectedKnotId: (id: string | null) => void;
  setRawContent: (content: string) => void;
  updateKnot: (knotName: string, newBodyContent: string) => void;
  addNewKnot: (name: string, x?: number, y?: number) => void;
  deleteSelectedKnot: () => void;
  addEdge: (sourceKnot: string, targetKnot: string) => void;
  removeEdge: (sourceKnot: string, targetKnot: string, lineNumber?: number) => void;
  updateEdge: (sourceKnot: string, oldTarget: string, newTarget: string, lineNumber?: number) => void;
  save: () => Promise<void>;
  reload: () => Promise<void>;
  onNodesChange: (changes: NodeChange[]) => void;
  onRegionMembershipChange: (knotName: string, oldRegion: string | null, newRegion: string | null) => void;
  addNewRegion: (name: string, x: number, y: number) => void;
  renameKnotAction: (oldName: string, newName: string) => void;
  renameRegionAction: (oldName: string, newName: string) => void;
  applyLayout: (algorithm: LayoutAlgorithm) => void;
}

/**
 * Generate React Flow nodes and edges from parsed ink
 */
function generateGraph(
  parsedInk: ParsedInk | null,
  selectedKnotId: string | null
): { nodes: Node[]; edges: Edge[] } {
  if (!parsedInk) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const { knots, regions, initialDivert } = parsedInk;
  const knotNames = new Set(knots.map(k => k.name));

  // Determine start target
  const startTarget = initialDivert || (knots.length > 0 ? knots[0].name : undefined);

  // Layout constants for nodes without saved positions
  const START_X = 50;
  const START_Y = 100;
  const LAYER_WIDTH = 400;
  const NODE_HEIGHT = 250;
  const NODE_SPACING = 50;
  const REGION_PADDING = 40; // Padding inside region for child nodes
  const REGION_HEADER_HEIGHT = 40; // Height of region header

  // Build adjacency for BFS layout (for nodes without positions)
  const adjacency = new Map<string, string[]>();
  for (const knot of knots) {
    adjacency.set(knot.name, knot.diverts.map(d => d.target).filter(t => t !== 'END'));
  }

  // BFS to assign layers (for auto-layout)
  const layers = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];

  if (startTarget && knotNames.has(startTarget)) {
    queue.push(startTarget);
    layers.set(startTarget, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentLayer = layers.get(current) || 0;
    const targets = adjacency.get(current) || [];

    for (const target of targets) {
      if (!visited.has(target) && knotNames.has(target)) {
        if (!layers.has(target)) {
          layers.set(target, currentLayer + 1);
          queue.push(target);
        }
      }
    }
  }

  // Assign layer 0 to any unvisited knots
  for (const knot of knots) {
    if (!layers.has(knot.name)) {
      layers.set(knot.name, 0);
    }
  }

  // Group knots by layer for auto-layout
  const layerGroups = new Map<number, string[]>();
  for (const [name, layer] of layers.entries()) {
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(name);
  }

  // Calculate auto-layout positions
  const autoPositions = new Map<string, { x: number; y: number }>();
  const maxLayer = Math.max(...layers.values(), 0);

  for (const [layer, knotNamesInLayer] of layerGroups.entries()) {
    const x = START_X + (layer + 1) * LAYER_WIDTH;
    const totalHeight = knotNamesInLayer.length * (NODE_HEIGHT + NODE_SPACING) - NODE_SPACING;
    const startY = START_Y + (NODE_HEIGHT / 2) - totalHeight / 2;

    knotNamesInLayer.forEach((name, index) => {
      const y = startY + index * (NODE_HEIGHT + NODE_SPACING);
      autoPositions.set(name, { x, y });
    });
  }

  // Build region lookup map
  const knotToRegion = new Map<string, InkRegion>();
  for (const region of regions) {
    for (const knotName of region.knotNames) {
      knotToRegion.set(knotName, region);
    }
  }

  // First, calculate all knot positions so we can determine region bounds
  const knotPositions = new Map<string, { x: number; y: number }>();

  for (const knot of knots) {
    const region = knotToRegion.get(knot.name);
    let position: { x: number; y: number };

    if (knot.position) {
      // Use saved absolute position
      position = knot.position;
    } else if (region) {
      // Auto-layout within region area
      const regionPos = region.position || { x: START_X + LAYER_WIDTH, y: START_Y };
      const knotIndex = region.knotNames.indexOf(knot.name);
      const cols = Math.min(region.knotNames.length, 3);
      const col = knotIndex % cols;
      const row = Math.floor(knotIndex / cols);
      position = {
        x: regionPos.x + REGION_PADDING + col * (350 + 30),
        y: regionPos.y + REGION_HEADER_HEIGHT + REGION_PADDING + row * (NODE_HEIGHT + 30),
      };
    } else {
      // Use BFS-based auto position
      const autoPos = autoPositions.get(knot.name) || { x: START_X + LAYER_WIDTH, y: START_Y };
      position = autoPos;
    }

    knotPositions.set(knot.name, position);
  }

  // Helper to calculate knot node height based on content
  function calculateKnotHeight(knot: InkKnot): number {
    const HEADER_HEIGHT = 40;
    const BODY_HEIGHT = 100; // Approximate, capped by max-height
    const HANDLE_ROW_HEIGHT = 28;
    const HANDLE_SECTION_PADDING = 12;

    const divertCount = knot.diverts.length;
    const handleSectionHeight = divertCount > 0
      ? HANDLE_SECTION_PADDING + (divertCount * HANDLE_ROW_HEIGHT)
      : 40; // "No diverts" section

    return HEADER_HEIGHT + BODY_HEIGHT + handleSectionHeight;
  }

  // Create region nodes with bounds calculated from contained knots
  for (const region of regions) {
    // Calculate bounding box from contained knots
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const KNOT_WIDTH = 350;
    const hasKnots = region.knotNames.length > 0;

    for (const knotName of region.knotNames) {
      const pos = knotPositions.get(knotName);
      const knot = knots.find(k => k.name === knotName);
      if (pos && knot) {
        const knotHeight = calculateKnotHeight(knot);
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + KNOT_WIDTH);
        maxY = Math.max(maxY, pos.y + knotHeight);
      }
    }

    let regionX: number, regionY: number, regionWidth: number, regionHeight: number;

    if (hasKnots && minX !== Infinity) {
      // Region has knots - calculate bounds from contained knots with padding
      regionX = minX - REGION_PADDING;
      regionY = minY - REGION_HEADER_HEIGHT - REGION_PADDING;
      regionWidth = (maxX - minX) + REGION_PADDING * 2;
      regionHeight = (maxY - minY) + REGION_HEADER_HEIGHT + REGION_PADDING * 2;
    } else {
      // Empty region - use saved position directly (position is the node's top-left corner)
      const savedPos = region.position || { x: START_X + LAYER_WIDTH, y: START_Y };
      regionX = savedPos.x;
      regionY = savedPos.y;
      regionWidth = 400;
      regionHeight = 300;
    }

    nodes.push({
      id: `__region__${region.name}`,
      type: 'regionNode',
      position: { x: regionX, y: regionY },
      data: {
        name: region.name,
        knotNames: region.knotNames,
        region,
      } as RegionNodeData,
      draggable: true,
      selectable: true,
      zIndex: -1,
      style: {
        width: regionWidth,
        height: regionHeight,
      },
    });
  }

  // Add START node - use saved position or default
  nodes.push({
    id: '__start__',
    type: 'startNode',
    position: parsedInk.startPosition || { x: START_X, y: START_Y },
    data: { target: startTarget || '' } as StartNodeData,
    draggable: true,
  });

  // Create knot nodes with absolute positions
  for (const knot of knots) {
    const hasErrors = knotHasErrors(knot, parsedInk);
    const position = knotPositions.get(knot.name) || { x: START_X + LAYER_WIDTH, y: START_Y };

    // Separate conditional diverts from regular diverts
    // Also filter out stitch diverts (those with a dot, e.g., "knot.stitch") as they're internal navigation
    const regularDiverts = knot.diverts.filter(d => d.context !== 'conditional' && !d.target.includes('.'));
    const conditionalDiverts = knot.diverts.filter(d => d.context === 'conditional' && !d.target.includes('.'));

    nodes.push({
      id: knot.name,
      type: 'knotNode',
      position,
      data: {
        name: knot.name,
        bodyContent: knot.bodyContent,
        diverts: regularDiverts,
        conditionalDiverts,
        hasErrors,
        knot,
        storyFlags: knot.storyFlags,
      } as KnotNodeData,
      draggable: true,
      zIndex: 1, // Ensure knots are above regions
    });
  }

  // Check if any knot diverts to END
  const hasDivertToEnd = knots.some(k => k.diverts.some(d => d.target === 'END'));

  // Add END node - use saved position or auto-layout
  if (hasDivertToEnd) {
    nodes.push({
      id: '__end__',
      type: 'endNode',
      position: parsedInk.endPosition || { x: START_X + (maxLayer + 2) * LAYER_WIDTH, y: START_Y },
      data: { label: 'END' } as EndNodeData,
      draggable: true,
    });
  }

  // Highlight color for edges connected to selected node
  const HIGHLIGHT_COLOR = '#ffc107'; // Amber/yellow for visibility
  const HIGHLIGHT_STROKE_WIDTH = 3;

  // Create edge from START to initial target
  if (startTarget && knotNames.has(startTarget)) {
    const isHighlighted = selectedKnotId === startTarget;
    edges.push({
      id: `__start__->${startTarget}`,
      source: '__start__',
      target: startTarget,
      targetHandle: 'input',
      animated: false,
      style: isHighlighted
        ? { stroke: HIGHLIGHT_COLOR, strokeWidth: HIGHLIGHT_STROKE_WIDTH, strokeDasharray: '12 6' }
        : { stroke: '#4caf50', strokeWidth: 3 },
      className: isHighlighted ? 'ink-edge-highlighted' : undefined,
      zIndex: isHighlighted ? 1000 : 0,
    });
  }

  // Create edges from knots to their divert targets
  // Each divert gets its own edge (no deduplication) with a unique handle ID
  for (const knot of knots) {
    for (const divert of knot.diverts) {
      // Skip stitch diverts (contain a dot, e.g., "knot.stitch") - these are internal navigation
      if (divert.target.includes('.')) {
        continue;
      }

      const targetId = divert.target === 'END' ? '__end__' : divert.target;

      // Unique handle ID format: "line:{lineNumber}:{target}"
      const sourceHandle = `line:${divert.lineNumber}:${divert.target}`;

      // Determine edge label: use choice text if available, otherwise target name
      let edgeLabel: string;
      if (divert.context === 'choice' && divert.choiceText) {
        // Truncate long choice text
        const text = divert.choiceText;
        edgeLabel = text.length > 30 ? text.substring(0, 27) + '...' : text;
      } else {
        edgeLabel = divert.target;
      }

      // Check if this edge is connected to the selected node
      const isHighlighted = selectedKnotId === knot.name || selectedKnotId === divert.target;
      const isConditional = divert.context === 'conditional';

      // Determine edge style based on selection, target, and context
      let edgeStyle: { stroke?: string; strokeWidth: number; strokeDasharray?: string };
      let edgeClassName: string | undefined;
      if (isHighlighted) {
        edgeStyle = { stroke: HIGHLIGHT_COLOR, strokeWidth: HIGHLIGHT_STROKE_WIDTH, strokeDasharray: '12 6' };
        edgeClassName = 'ink-edge-highlighted';
      } else if (divert.target === 'END') {
        edgeStyle = { stroke: '#f44336', strokeWidth: 3 };
      } else if (isConditional) {
        edgeStyle = { stroke: '#2196f3', strokeWidth: 2, strokeDasharray: '5 5' };
      } else {
        edgeStyle = { strokeWidth: 2 };
      }

      // Only create edge if target exists
      if (divert.target === 'END' || knotNames.has(divert.target)) {
        edges.push({
          // Unique edge ID includes line number
          id: `${knot.name}:${divert.lineNumber}->${divert.target}`,
          source: knot.name,
          sourceHandle, // Connect from the specific divert handle (unique per line)
          target: targetId,
          targetHandle: 'input',
          type: 'smoothstep',
          label: edgeLabel,
          labelStyle: isHighlighted
            ? { fill: HIGHLIGHT_COLOR, fontSize: 12, fontWeight: 600 }
            : { fill: '#ccc', fontSize: 11 },
          labelBgStyle: { fill: '#1e1e1e', fillOpacity: 0.8 },
          labelBgPadding: [4, 2] as [number, number],
          style: edgeStyle,
          className: edgeClassName,
          markerEnd: { type: 'arrowclosed' as const },
          zIndex: isHighlighted ? 1000 : 0,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Custom hook for managing the Ink editor state
 */
export function useInkEditor(filePath: string | undefined): UseInkEditorResult {
  // Core state
  const [rawContent, setRawContentInternal] = useState('');
  const [parsedInk, setParsedInk] = useState<ParsedInk | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [selectedKnotId, setSelectedKnotId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Track pending position updates (to batch them)
  const pendingKnotPositions = useRef<Map<string, NodePosition>>(new Map());
  const pendingRegionPositions = useRef<Map<string, NodePosition>>(new Map());
  const pendingStartPosition = useRef<NodePosition | null>(null);
  const pendingEndPosition = useRef<NodePosition | null>(null);
  const positionUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce timer ref for parsing
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flag to skip re-parsing for position-only changes
  // This prevents the editor from "reloading" when just moving nodes
  const skipNextParse = useRef(false);

  // Load file when filePath changes
  useEffect(() => {
    if (!filePath) {
      setRawContentInternal('');
      setParsedInk(null);
      setSelectedKnotId(null);
      setIsDirty(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await window.electronAPI.readFile(filePath!);
        if (!cancelled) {
          setRawContentInternal(content);
          setParsedInk(parseInk(content));
          setIsDirty(false);
          setSelectedKnotId(null);
          pendingKnotPositions.current.clear();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadFile();

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Parse content with debounce when rawContent changes
  // Skip parsing if it's a position-only change (to prevent editor "reload")
  useEffect(() => {
    // Check if we should skip this parse (position-only change)
    if (skipNextParse.current) {
      skipNextParse.current = false;
      return;
    }

    if (parseTimerRef.current) {
      clearTimeout(parseTimerRef.current);
    }

    parseTimerRef.current = setTimeout(() => {
      if (rawContent) {
        setParsedInk(parseInk(rawContent));
      } else {
        setParsedInk(null);
      }
    }, 300);

    return () => {
      if (parseTimerRef.current) {
        clearTimeout(parseTimerRef.current);
      }
    };
  }, [rawContent]);

  // Function to flush pending position updates immediately
  // This is called when switching views to ensure positions are saved before the switch
  const flushPendingPositions = useCallback(() => {
    // Cancel any pending debounced update
    if (positionUpdateTimer.current) {
      clearTimeout(positionUpdateTimer.current);
      positionUpdateTimer.current = null;
    }

    const hasKnotChanges = pendingKnotPositions.current.size > 0;
    const hasRegionChanges = pendingRegionPositions.current.size > 0;
    const hasStartChange = pendingStartPosition.current !== null;
    const hasEndChange = pendingEndPosition.current !== null;

    if (!parsedInk || (!hasKnotChanges && !hasRegionChanges && !hasStartChange && !hasEndChange)) {
      return rawContent; // Nothing to flush
    }

    let newContent = rawContent;

    // Update start position
    if (hasStartChange && pendingStartPosition.current) {
      newContent = updateStartPosition(newContent, pendingStartPosition.current);
      pendingStartPosition.current = null;
    }

    // Update end position
    if (hasEndChange && pendingEndPosition.current) {
      newContent = updateEndPosition(newContent, pendingEndPosition.current);
      pendingEndPosition.current = null;
    }

    // Update knot positions
    if (hasKnotChanges) {
      newContent = updateKnotPositions(
        newContent,
        pendingKnotPositions.current,
        parsedInk.knots
      );
      pendingKnotPositions.current.clear();
    }

    // Update region positions
    if (hasRegionChanges) {
      newContent = updateRegionPositions(
        newContent,
        pendingRegionPositions.current,
        parsedInk.regions
      );
      pendingRegionPositions.current.clear();
    }

    return newContent;
  }, [rawContent, parsedInk]);

  // Custom setViewMode that flushes pending positions before switching
  const setViewModeWithFlush = useCallback((newMode: ViewMode) => {
    // If switching away from graph view, flush any pending position updates first
    if (viewMode === 'graph' && newMode !== 'graph') {
      const flushedContent = flushPendingPositions();
      if (flushedContent !== rawContent) {
        // Position updates were flushed - update rawContent without skipping parse
        // (we WANT to parse so the raw view shows updated positions)
        setRawContentInternal(flushedContent);
        setIsDirty(true);
        // Parse immediately so raw view has correct content
        setParsedInk(parseInk(flushedContent));
      }
    }

    // If switching TO graph view from raw, re-parse BEFORE setting viewMode
    // This ensures parsedInk has updated positions BEFORE InkNodeEditor mounts
    if (viewMode === 'raw' && newMode === 'graph' && rawContent) {
      setParsedInk(parseInk(rawContent));
    }

    setViewMode(newMode);
  }, [viewMode, flushPendingPositions, rawContent]);

  // Track previous view mode to detect switches
  const prevViewModeRef = useRef<ViewMode>(viewMode);

  // Re-parse when switching TO graph view to ensure positions are up-to-date
  // This is needed because position-only changes skip parsing (to avoid graph reload),
  // but when switching back to graph view, we need the latest positions from rawContent
  useEffect(() => {
    const wasRaw = prevViewModeRef.current === 'raw';
    const isNowGraph = viewMode === 'graph';
    prevViewModeRef.current = viewMode;

    // If switching from raw to graph, re-parse to get updated positions
    if (wasRaw && isNowGraph && rawContent) {
      setParsedInk(parseInk(rawContent));
    }
  }, [viewMode, rawContent]);

  // Generate nodes and edges
  const { nodes, edges } = useMemo(
    () => generateGraph(parsedInk, selectedKnotId),
    [parsedInk, selectedKnotId]
  );

  // Get the selected knot
  const selectedKnot = useMemo(() => {
    if (!selectedKnotId || !parsedInk) return null;
    return parsedInk.knots.find(k => k.name === selectedKnotId) || null;
  }, [selectedKnotId, parsedInk]);

  // Set raw content and mark dirty
  const setRawContent = useCallback((content: string) => {
    setRawContentInternal(content);
    setIsDirty(true);
  }, []);

  // Handle node position changes (from dragging)
  // Note: Region dragging is handled in InkNodeEditor which moves contained knots
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Track which regions have knots that moved (to recalculate their positions)
    const affectedRegions = new Set<string>();

    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        if (change.id === '__start__') {
          // It's the START node
          pendingStartPosition.current = {
            x: change.position.x,
            y: change.position.y,
          };
        } else if (change.id === '__end__') {
          // It's the END node
          pendingEndPosition.current = {
            x: change.position.x,
            y: change.position.y,
          };
        } else if (change.id.startsWith('__region__')) {
          // It's a region node - save position directly
          const regionName = change.id.replace('__region__', '');
          pendingRegionPositions.current.set(regionName, {
            x: change.position.x,
            y: change.position.y,
          });
        } else if (!change.id.startsWith('__')) {
          // It's a knot node - save position
          pendingKnotPositions.current.set(change.id, {
            x: change.position.x,
            y: change.position.y,
          });

          // Check if this knot is in a region
          if (parsedInk) {
            const knot = parsedInk.knots.find(k => k.name === change.id);
            if (knot?.regionName) {
              affectedRegions.add(knot.regionName);
            }
          }
        }
      }
    }

    // Debounce the position save
    if (positionUpdateTimer.current) {
      clearTimeout(positionUpdateTimer.current);
    }

    positionUpdateTimer.current = setTimeout(() => {
      const hasKnotChanges = pendingKnotPositions.current.size > 0;
      let hasRegionChanges = pendingRegionPositions.current.size > 0;
      const hasStartChange = pendingStartPosition.current !== null;
      const hasEndChange = pendingEndPosition.current !== null;

      // Capture start/end positions before clearing
      const newStartPosition = pendingStartPosition.current;
      const newEndPosition = pendingEndPosition.current;

      if ((hasKnotChanges || hasRegionChanges || hasStartChange || hasEndChange) && parsedInk) {
        let newContent = rawContent;

        // Update start position
        if (hasStartChange && newStartPosition) {
          newContent = updateStartPosition(newContent, newStartPosition);
          pendingStartPosition.current = null;
        }

        // Update end position
        if (hasEndChange && newEndPosition) {
          newContent = updateEndPosition(newContent, newEndPosition);
          pendingEndPosition.current = null;
        }

        // Update knot positions
        if (hasKnotChanges) {
          newContent = updateKnotPositions(
            newContent,
            pendingKnotPositions.current,
            parsedInk.knots
          );
        }

        // For regions that had knots move, recalculate and save their positions
        // This ensures the region stays in place when knots leave
        if (affectedRegions.size > 0) {
          const REGION_PADDING = 40;
          const REGION_HEADER_HEIGHT = 40;

          for (const regionName of affectedRegions) {
            // Skip if we already have a direct region position change
            if (pendingRegionPositions.current.has(regionName)) continue;

            const region = parsedInk.regions.find(r => r.name === regionName);
            if (!region || region.knotNames.length === 0) continue;

            // Calculate min position from all knots in the region
            // Use pending positions for moved knots, existing positions for others
            let minX = Infinity;
            let minY = Infinity;

            for (const knotName of region.knotNames) {
              const pendingPos = pendingKnotPositions.current.get(knotName);
              const knot = parsedInk.knots.find(k => k.name === knotName);

              if (pendingPos) {
                minX = Math.min(minX, pendingPos.x);
                minY = Math.min(minY, pendingPos.y);
              } else if (knot?.position) {
                minX = Math.min(minX, knot.position.x);
                minY = Math.min(minY, knot.position.y);
              }
            }

            if (minX !== Infinity && minY !== Infinity) {
              // Calculate region top-left corner (same formula as in generateGraph)
              const regionX = minX - REGION_PADDING;
              const regionY = minY - REGION_HEADER_HEIGHT - REGION_PADDING;
              pendingRegionPositions.current.set(regionName, { x: regionX, y: regionY });
              hasRegionChanges = true;
            }
          }
        }

        pendingKnotPositions.current.clear();

        // Update region positions in content
        if (hasRegionChanges) {
          newContent = updateRegionPositions(
            newContent,
            pendingRegionPositions.current,
            parsedInk.regions
          );
          pendingRegionPositions.current.clear();
        }

        // Set flag to skip re-parsing from the rawContent change
        // We do NOT update parsedInk here - React Flow maintains its own position state
        // parsedInk positions are only used for initial load, not during editing
        skipNextParse.current = true;
        setRawContentInternal(newContent);
        setIsDirty(true);
      }
    }, 500);
  }, [rawContent, parsedInk]);

  // Update a specific knot's body content
  const updateKnot = useCallback((knotName: string, newBodyContent: string) => {
    if (!parsedInk) return;

    const knot = parsedInk.knots.find(k => k.name === knotName);
    if (!knot) return;

    // Strip position comment from new content (position is preserved separately)
    const cleanContent = stripPositionComment(newBodyContent);
    const newContent = updateKnotContent(rawContent, knot, cleanContent);
    setRawContent(newContent);
  }, [parsedInk, rawContent, setRawContent]);

  // Add a new knot
  const addNewKnot = useCallback((name: string, x?: number, y?: number) => {
    // Use provided position or default
    const position: NodePosition = { x: x ?? 400, y: y ?? 200 };
    const newContent = addKnot(rawContent, name, position);
    setRawContent(newContent);
  }, [rawContent, setRawContent]);

  // Delete the selected knot
  const deleteSelectedKnot = useCallback(() => {
    if (!selectedKnot) return;

    const newContent = deleteKnot(rawContent, selectedKnot);
    setRawContent(newContent);
    setSelectedKnotId(null);
  }, [selectedKnot, rawContent, setRawContent]);

  // Add an edge (divert) between knots
  const addEdgeAction = useCallback((sourceKnot: string, targetKnot: string) => {
    if (!parsedInk) return;

    const source = parsedInk.knots.find(k => k.name === sourceKnot);
    if (!source) return;

    const newContent = addDivert(rawContent, source, targetKnot);
    setRawContent(newContent);
  }, [parsedInk, rawContent, setRawContent]);

  // Remove an edge (divert) between knots
  const removeEdgeAction = useCallback((sourceKnot: string, targetKnot: string) => {
    if (!parsedInk) return;

    const source = parsedInk.knots.find(k => k.name === sourceKnot);
    if (!source) return;

    const newContent = removeDivert(rawContent, source, targetKnot);
    setRawContent(newContent);
  }, [parsedInk, rawContent, setRawContent]);

  // Update an edge (change divert target)
  const updateEdgeAction = useCallback((sourceKnot: string, oldTarget: string, newTarget: string, lineNumber?: number) => {
    if (!parsedInk) return;
    if (oldTarget === newTarget) return;

    const source = parsedInk.knots.find(k => k.name === sourceKnot);
    if (!source) return;

    const newContent = updateDivert(rawContent, source, oldTarget, newTarget, lineNumber);
    setRawContent(newContent);
  }, [parsedInk, rawContent, setRawContent]);

  // Save the file
  const save = useCallback(async () => {
    if (!filePath || !isDirty) return;

    setIsSaving(true);
    try {
      await window.electronAPI.writeFile(filePath, rawContent);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, rawContent, isDirty]);

  // Reload the file
  const reload = useCallback(async () => {
    if (!filePath) return;

    setIsLoading(true);
    setError(null);

    try {
      const content = await window.electronAPI.readFile(filePath);
      setRawContentInternal(content);
      setParsedInk(parseInk(content));
      setIsDirty(false);
      pendingKnotPositions.current.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload file');
    } finally {
      setIsLoading(false);
    }
  }, [filePath]);

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save]);

  // Add a new region
  const addNewRegion = useCallback((name: string, x: number, y: number) => {
    const position: NodePosition = { x, y };
    const newContent = addRegion(rawContent, name, position);
    setRawContent(newContent);
  }, [rawContent, setRawContent]);

  // Handle region membership change (knot moved into/out of a region)
  const handleRegionMembershipChange = useCallback((
    knotName: string,
    oldRegion: string | null,
    newRegion: string | null
  ) => {
    if (!parsedInk) return;
    if (oldRegion === newRegion) return;

    // First, flush any pending position updates to ensure we work with current positions
    // This prevents the "reset" issue where old positions are used after region move
    let contentToModify = rawContent;
    if (pendingKnotPositions.current.size > 0) {
      // Cancel pending debounced position save
      if (positionUpdateTimer.current) {
        clearTimeout(positionUpdateTimer.current);
        positionUpdateTimer.current = null;
      }

      // Apply pending positions immediately
      contentToModify = updateKnotPositions(
        rawContent,
        pendingKnotPositions.current,
        parsedInk.knots
      );
      pendingKnotPositions.current.clear();
    }

    // Re-parse to get the updated knot with correct positions
    const updatedParsed = parseInk(contentToModify);
    const knot = updatedParsed.knots.find(k => k.name === knotName);
    if (!knot) return;

    const targetRegion = newRegion
      ? updatedParsed.regions.find(r => r.name === newRegion)
      : null;

    const newContent = moveKnotToRegion(contentToModify, knot, targetRegion || null, updatedParsed.regions);
    setRawContentInternal(newContent);
    setIsDirty(true);
    // Update parsed ink with new content to avoid stale state
    setParsedInk(parseInk(newContent));
  }, [parsedInk, rawContent]);

  // Rename a knot (updates all references)
  const renameKnotAction = useCallback((oldName: string, newName: string) => {
    if (oldName === newName) return;
    const newContent = renameKnot(rawContent, oldName, newName);
    setRawContent(newContent);
    // Update selection if the renamed knot was selected
    if (selectedKnotId === oldName) {
      setSelectedKnotId(newName);
    }
  }, [rawContent, setRawContent, selectedKnotId]);

  // Rename a region
  const renameRegionAction = useCallback((oldName: string, newName: string) => {
    if (oldName === newName) return;
    const newContent = renameRegion(rawContent, oldName, newName);
    setRawContent(newContent);
  }, [rawContent, setRawContent]);

  // Apply auto-layout algorithm to reposition nodes
  const applyLayout = useCallback((algorithm: LayoutAlgorithm) => {
    if (!parsedInk || nodes.length === 0) return;

    // Filter to only knot nodes (exclude regions, start, end for layout calculation)
    const knotNodes = nodes.filter(n => n.type === 'knotNode');
    const knotEdges = edges.filter(e =>
      !e.source.startsWith('__') && !e.target.startsWith('__')
    );

    if (knotNodes.length === 0) return;

    // Calculate new positions using the selected algorithm
    const positions = calculateLayout(algorithm, knotNodes, knotEdges);

    // Calculate bounds of laid out nodes to position START and END
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pos of positions.values()) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }

    // Calculate START and END positions
    const hasStartNode = nodes.some(n => n.id === '__start__');
    const hasEndNode = nodes.some(n => n.id === '__end__');
    const newStartPosition: NodePosition | null = hasStartNode ? { x: minX - 400, y: minY } : null;
    const newEndPosition: NodePosition | null = hasEndNode ? { x: maxX + 450, y: minY } : null;

    // Update rawContent with new positions
    let newContent = rawContent;

    // Update start position
    if (newStartPosition) {
      newContent = updateStartPosition(newContent, newStartPosition);
    }

    // Update end position
    if (newEndPosition) {
      newContent = updateEndPosition(newContent, newEndPosition);
    }

    // Update knot positions
    newContent = updateKnotPositions(newContent, positions, parsedInk.knots);

    // Update state - DO NOT skip parsing since we want the UI to update
    setRawContentInternal(newContent);
    setIsDirty(true);

    // Immediately re-parse to update the UI with new positions
    setParsedInk(parseInk(newContent));
  }, [parsedInk, nodes, edges, rawContent]);

  return {
    rawContent,
    parsedInk,
    viewMode,
    selectedKnotId,
    selectedKnot,
    isDirty,
    isLoading,
    error,
    isSaving,
    nodes,
    edges,
    setViewMode: setViewModeWithFlush,
    setSelectedKnotId,
    setRawContent,
    updateKnot,
    addNewKnot,
    deleteSelectedKnot,
    addEdge: addEdgeAction,
    removeEdge: removeEdgeAction,
    updateEdge: updateEdgeAction,
    save,
    reload,
    onNodesChange,
    onRegionMembershipChange: handleRegionMembershipChange,
    addNewRegion,
    renameKnotAction,
    renameRegionAction,
    applyLayout,
  };
}

export default useInkEditor;
