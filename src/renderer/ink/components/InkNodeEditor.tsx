/**
 * InkNodeEditor component
 *
 * ReactFlow graph visualization of the ink file.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type OnConnect,
  type OnReconnect,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type Node,
  type Edge,
  type NodeChange,
  applyNodeChanges,
  reconnectEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { inkNodeTypes, parseHandleId } from '../nodes';

import './InkEditor.css';

export interface InkNodeEditorProps {
  /** Initial nodes */
  initialNodes: Node[];
  /** Initial edges */
  initialEdges: Edge[];
  /** Callback when a node is selected */
  onNodeSelect: (nodeId: string | null) => void;
  /** Callback when an edge is created */
  onEdgeCreate?: (sourceId: string, targetId: string) => void;
  /** Callback when an edge is deleted */
  onEdgeDelete?: (sourceId: string, targetId: string, lineNumber?: number) => void;
  /** Callback when an edge target is changed (reconnection) */
  onEdgeUpdate?: (sourceId: string, oldTarget: string, newTarget: string, lineNumber?: number) => void;
  /** Callback when a node is deleted */
  onNodeDelete?: (nodeId: string) => void;
  /** Callback when nodes change (position, etc.) */
  onNodesChange?: (changes: NodeChange[]) => void;
  /** Callback when a knot's region membership changes */
  onRegionMembershipChange?: (knotName: string, oldRegion: string | null, newRegion: string | null) => void;
  /** Callback when a new region should be created (x, y are flow coordinates) */
  onRegionCreate?: (name: string, x: number, y: number) => void;
  /** Callback when a new knot should be created (x, y are flow coordinates) */
  onKnotCreate?: (name: string, x: number, y: number) => void;
  /** Callback when a knot should be renamed */
  onKnotRename?: (oldName: string, newName: string) => void;
  /** Callback when a region should be renamed */
  onRegionRename?: (oldName: string, newName: string) => void;
  /** List of existing knot names for validation */
  existingKnotNames?: string[];
  /** List of existing region names for validation */
  existingRegionNames?: string[];
  /** Callback to register a focusNode function (for external navigation) */
  onFocusNodeRegister?: (focusNode: (nodeId: string) => void) => void;
}

// Inner component that uses ReactFlow hooks
function InkNodeEditorInner({
  initialNodes,
  initialEdges,
  onNodeSelect,
  onEdgeCreate,
  onEdgeDelete,
  onEdgeUpdate,
  onNodeDelete,
  onNodesChange,
  onRegionMembershipChange,
  onRegionCreate,
  onKnotCreate,
  onKnotRename,
  onRegionRename,
  existingKnotNames = [],
  existingRegionNames = [],
  onFocusNodeRegister,
}: InkNodeEditorProps) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, flowToScreenPosition, setCenter, getZoom } = useReactFlow();

  // Focus on a specific node (zoom and center)
  const focusNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      // Get the node dimensions for centering
      const nodeWidth = typeof node.style?.width === 'number' ? node.style.width : 200;
      const nodeHeight = typeof node.style?.height === 'number' ? node.style.height : 100;

      // Center on the node with current zoom (or default zoom of 1)
      const currentZoom = getZoom();
      const targetZoom = Math.max(currentZoom, 0.8); // Ensure zoom is at least 0.8

      setCenter(
        node.position.x + nodeWidth / 2,
        node.position.y + nodeHeight / 2,
        { zoom: targetZoom, duration: 300 }
      );
    }
  }, [nodes, setCenter, getZoom]);

  // Register the focusNode function with parent
  useEffect(() => {
    if (onFocusNodeRegister) {
      onFocusNodeRegister(focusNode);
    }
  }, [focusNode, onFocusNodeRegister]);

  // Track whether we've initialized with real data (to distinguish initial load from updates)
  const hasInitialized = useRef(false);
  const lastInitialNodesRef = useRef<string>('');
  // Track positions fingerprint to detect layout changes from parent
  const lastPositionsFingerprintRef = useRef<string>('');

  // Track region drag state for moving contained knots
  const regionDragState = useRef<Map<string, {
    startX: number;
    startY: number;
    knotStartPositions: Map<string, { x: number; y: number }>;
  }>>(new Map());

  // Track shift key state for keeping nodes in groups
  const [isShiftHeld, setIsShiftHeld] = useState(false);

  // Track drag hint state (shown when dragging a node that's in a group)
  const [dragHint, setDragHint] = useState<{
    visible: boolean;
    x: number;
    y: number;
    knotName: string;
    regionName: string;
  } | null>(null);

  // Track which node is being dragged (for edge highlighting)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Context menu state (screenX/screenY for positioning menu, flowX/flowY for placing nodes)
  const [contextMenu, setContextMenu] = useState<{
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
    type: 'canvas' | 'knot' | 'region' | 'edge';
    nodeId?: string;
    edgeId?: string;
  } | null>(null);

  // Region name dialog state (flow coordinates for node placement)
  const [regionDialog, setRegionDialog] = useState<{
    flowX: number;
    flowY: number;
  } | null>(null);
  const [regionNameInput, setRegionNameInput] = useState('');

  // Knot name dialog state (flow coordinates for node placement)
  const [knotDialog, setKnotDialog] = useState<{
    flowX: number;
    flowY: number;
  } | null>(null);
  const [knotNameInput, setKnotNameInput] = useState('');

  // Rename dialog state
  const [renameDialog, setRenameDialog] = useState<{
    type: 'knot' | 'region';
    oldName: string;
  } | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Track shift key globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftHeld(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Sync nodes when props change - preserve positions from React Flow's internal state
  // Key insight: only reset positions when structure changes (nodes added/removed),
  // not when data changes (selection highlighting, content edits)
  // EXCEPTION: When positions significantly change (e.g., layout applied), use new positions
  useEffect(() => {
    // Create a structural fingerprint: sorted list of node IDs
    const newFingerprint = initialNodes.map(n => n.id).sort().join(',');
    const structureChanged = newFingerprint !== lastInitialNodesRef.current;

    // Create a positions fingerprint to detect layout changes
    // Round positions to avoid floating point noise
    const newPositionsFingerprint = initialNodes
      .map(n => `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}`)
      .sort()
      .join('|');
    const positionsChanged = newPositionsFingerprint !== lastPositionsFingerprintRef.current;

    setNodes(currentNodes => {
      // If initialNodes is empty, clear everything
      if (initialNodes.length === 0) {
        hasInitialized.current = false;
        lastInitialNodesRef.current = '';
        lastPositionsFingerprintRef.current = '';
        return [];
      }

      // CASE 1: First load - use initialNodes directly (positions from file)
      // This happens when: not yet initialized, OR no current nodes
      if (!hasInitialized.current || currentNodes.length === 0) {
        hasInitialized.current = true;
        lastInitialNodesRef.current = newFingerprint;
        lastPositionsFingerprintRef.current = newPositionsFingerprint;
        return initialNodes;
      }

      // CASE 2: Structure changed (nodes added/removed) - preserve existing node positions
      // but use file positions for new nodes
      if (structureChanged) {
        lastInitialNodesRef.current = newFingerprint;
        lastPositionsFingerprintRef.current = newPositionsFingerprint;
        const currentState = new Map(
          currentNodes.map(n => [n.id, { position: n.position, selected: n.selected }])
        );
        return initialNodes.map(newNode => {
          const current = currentState.get(newNode.id);
          if (current) {
            // Existing node - preserve its position from React Flow state
            return { ...newNode, position: current.position, selected: current.selected };
          }
          // New node - use position from initialNodes (file)
          return newNode;
        });
      }

      // CASE 3: Positions significantly changed (e.g., layout applied)
      // Use positions from initialNodes (parent's new positions) but preserve selection
      if (positionsChanged) {
        lastPositionsFingerprintRef.current = newPositionsFingerprint;
        const currentSelections = new Map(
          currentNodes.map(n => [n.id, n.selected])
        );
        return initialNodes.map(newNode => ({
          ...newNode,
          selected: currentSelections.get(newNode.id) ?? newNode.selected,
        }));
      }

      // CASE 4: Data-only update (e.g., selection change, content edit)
      // Preserve ALL positions from React Flow's current state
      const currentState = new Map(
        currentNodes.map(n => [n.id, { position: n.position, selected: n.selected }])
      );

      return initialNodes.map(newNode => {
        const current = currentState.get(newNode.id);
        if (current) {
          return {
            ...newNode,
            position: current.position,
            selected: current.selected,
          };
        }
        return newNode;
      });
    });

    // Update fingerprints after processing
    lastInitialNodesRef.current = newFingerprint;
    // Note: positions fingerprint is updated inside setNodes for consistency
  }, [initialNodes]);

  // Sync edges when props change or dragging state changes
  // Apply edge highlighting for dragging node (separate from selection highlighting)
  useEffect(() => {
    if (draggingNodeId) {
      // Apply highlighting to edges connected to the dragging node
      const HIGHLIGHT_COLOR = '#ffc107';
      const HIGHLIGHT_STROKE_WIDTH = 3;

      setEdges(initialEdges.map(edge => {
        // Check if edge is connected to the dragging node
        // Handle START node edge (source is __start__, check target)
        // Handle regular edges (check source or target)
        const isConnected =
          edge.source === draggingNodeId ||
          edge.target === draggingNodeId ||
          (edge.source === '__start__' && edge.target === draggingNodeId);

        if (isConnected) {
          return {
            ...edge,
            style: { ...edge.style, stroke: HIGHLIGHT_COLOR, strokeWidth: HIGHLIGHT_STROKE_WIDTH },
            labelStyle: { ...edge.labelStyle, fill: HIGHLIGHT_COLOR, fontSize: 12, fontWeight: 600 },
            zIndex: 1000,
          };
        }
        return edge;
      }));
    } else {
      // No dragging, use edges as-is (with selection highlighting from props)
      setEdges(initialEdges);
    }
  }, [initialEdges, draggingNodeId]);

  // Get region bounds for hit testing
  const getRegionBounds = useCallback((regionNode: Node) => {
    const width = typeof regionNode.style?.width === 'number' ? regionNode.style.width : 400;
    const height = typeof regionNode.style?.height === 'number' ? regionNode.style.height : 300;
    return {
      x: regionNode.position.x,
      y: regionNode.position.y,
      width,
      height,
    };
  }, []);

  // Check if a point is inside a region
  const isInsideRegion = useCallback((x: number, y: number, regionNode: Node) => {
    const bounds = getRegionBounds(regionNode);
    return x >= bounds.x && x <= bounds.x + bounds.width &&
           y >= bounds.y && y <= bounds.y + bounds.height;
  }, [getRegionBounds]);

  // Find which region a knot belongs to based on the node data
  const getKnotRegion = useCallback((knotId: string, currentNodes: Node[]): string | null => {
    for (const node of currentNodes) {
      if (node.id.startsWith('__region__')) {
        const regionData = node.data as { knotNames?: string[] };
        if (regionData.knotNames?.includes(knotId)) {
          return node.id.replace('__region__', '');
        }
      }
    }
    return null;
  }, []);

  // Track additional changes from region dragging (needs to be outside setNodes for persistence)
  const pendingKnotChanges = useRef<NodeChange[]>([]);

  // Handle node changes (dragging, selection, etc.)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Track region membership changes to fire after state update
      const membershipChanges: Array<{ knotId: string; oldRegion: string | null; newRegion: string | null }> = [];

      setNodes((currentNodes) => {
        let updatedNodes = [...currentNodes];

        for (const change of changes) {
          if (change.type === 'position' && change.position) {
            // Check if this is a region being dragged
            if (change.id.startsWith('__region__')) {
              const regionName = change.id.replace('__region__', '');
              const regionNode = currentNodes.find(n => n.id === change.id);

              if (regionNode && change.dragging) {
                // Region is being dragged
                if (!regionDragState.current.has(regionName)) {
                  // First drag event - record start positions
                  const knotStartPositions = new Map<string, { x: number; y: number }>();
                  const regionData = regionNode.data as { knotNames?: string[] };

                  for (const knotName of regionData.knotNames || []) {
                    const knotNode = currentNodes.find(n => n.id === knotName);
                    if (knotNode) {
                      knotStartPositions.set(knotName, { ...knotNode.position });
                    }
                  }

                  regionDragState.current.set(regionName, {
                    startX: regionNode.position.x,
                    startY: regionNode.position.y,
                    knotStartPositions,
                  });
                }

                // Calculate delta and move contained knots
                const state = regionDragState.current.get(regionName)!;
                const deltaX = change.position.x - state.startX;
                const deltaY = change.position.y - state.startY;

                // Update knot positions visually
                for (const [knotName, startPos] of state.knotStartPositions) {
                  const knotIndex = updatedNodes.findIndex(n => n.id === knotName);
                  if (knotIndex >= 0) {
                    updatedNodes[knotIndex] = {
                      ...updatedNodes[knotIndex],
                      position: {
                        x: startPos.x + deltaX,
                        y: startPos.y + deltaY,
                      },
                    };
                  }
                }
              } else if (!change.dragging && regionDragState.current.has(regionName)) {
                // Drag ended - clean up and prepare changes for persistence
                const state = regionDragState.current.get(regionName)!;
                const deltaX = change.position.x - state.startX;
                const deltaY = change.position.y - state.startY;

                // Queue position changes for all moved knots (for persistence)
                for (const [knotName, startPos] of state.knotStartPositions) {
                  pendingKnotChanges.current.push({
                    type: 'position',
                    id: knotName,
                    position: {
                      x: startPos.x + deltaX,
                      y: startPos.y + deltaY,
                    },
                    dragging: false,
                  });
                }

                regionDragState.current.delete(regionName);
              }
            } else if (!change.id.startsWith('__')) {
              // A knot is being dragged
              const oldRegion = getKnotRegion(change.id, currentNodes);

              if (change.dragging) {
                // Update drag hint position as node moves
                if (oldRegion) {
                  setDragHint({
                    visible: true,
                    x: change.position.x,
                    y: change.position.y,
                    knotName: change.id,
                    regionName: oldRegion,
                  });
                }
              } else if (change.position) {
                // Drag ended - check region membership change
                // (hint is hidden by onNodeDragStop)

                // Check if it moved into/out of a region
                // Find which region (if any) the knot is now inside
                let newRegion: string | null = null;
                for (const node of currentNodes) {
                  if (node.id.startsWith('__region__') && isInsideRegion(change.position.x, change.position.y, node)) {
                    newRegion = node.id.replace('__region__', '');
                    break;
                  }
                }

                // If region membership changed and Shift is NOT held, queue the notification
                // If Shift IS held, keep the node in its original region (don't fire membership change)
                if (oldRegion !== newRegion && !isShiftHeld) {
                  membershipChanges.push({ knotId: change.id, oldRegion, newRegion });
                }
              }
            }
          }
        }

        // Apply all changes
        updatedNodes = applyNodeChanges(changes, updatedNodes);
        return updatedNodes;
      });

      // IMPORTANT: Notify parent about position changes FIRST (before membership changes)
      // This ensures handleRegionMembershipChange can flush pending positions correctly
      if (onNodesChange) {
        // Combine regular knot changes with pending changes from region drag
        // Include knot, region, start, and end position changes
        const positionChanges = changes.filter(
          c => c.type === 'position' && c.dragging === false &&
               (c.id.startsWith('__region__') || c.id === '__start__' || c.id === '__end__' || (!c.id.startsWith('__')))
        );

        const allChanges = [...positionChanges, ...pendingKnotChanges.current];
        pendingKnotChanges.current = []; // Clear pending changes

        if (allChanges.length > 0) {
          onNodesChange(allChanges);
        }
      }

      // Fire membership change callbacks AFTER position changes are sent
      // This ensures the parent has the pending positions when processing membership changes
      if (onRegionMembershipChange) {
        for (const { knotId, oldRegion, newRegion } of membershipChanges) {
          onRegionMembershipChange(knotId, oldRegion, newRegion);
        }
      }
    },
    [onNodesChange, onRegionMembershipChange, getKnotRegion, isInsideRegion, isShiftHeld]
  );

  // Handle node click
  const onNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      // Don't select special nodes
      if (node.id === '__start__' || node.id === '__end__') {
        onNodeSelect(null);
        return;
      }
      onNodeSelect(node.id);
    },
    [onNodeSelect]
  );

  // Handle node drag start - show hint if in a region, and highlight edges
  const onNodeDragStart: NodeMouseHandler = useCallback(
    (event, node) => {
      // Skip special nodes (START, END, regions)
      if (node.id.startsWith('__')) return;

      // Set dragging node for edge highlighting
      setDraggingNodeId(node.id);

      // Check if this knot is in a region
      const region = getKnotRegion(node.id, nodes);
      if (region) {
        // Show drag hint immediately at node position
        setDragHint({
          visible: true,
          x: node.position.x,
          y: node.position.y,
          knotName: node.id,
          regionName: region,
        });
      }
    },
    [nodes, getKnotRegion]
  );

  // Handle node drag stop - hide hint and clear edge highlighting
  const onNodeDragStop: NodeMouseHandler = useCallback(
    () => {
      setDragHint(null);
      setDraggingNodeId(null);
    },
    []
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
    setContextMenu(null);
  }, [onNodeSelect]);

  // Handle connection (edge creation or update)
  const onConnect: OnConnect = useCallback(
    (params) => {
      if (params.source && params.target) {
        // Only allow connections from knot nodes (not START/END)
        if (params.source !== '__start__' && params.source !== '__end__') {
          // Determine target name (handle END node)
          const targetName = params.target === '__end__' ? 'END' : params.target;

          // Check if there's already an edge from this source handle
          // If so, we need to update the existing divert, not add a new one
          const existingEdge = edges.find(
            e => e.source === params.source && e.sourceHandle === params.sourceHandle
          );

          if (existingEdge && params.sourceHandle) {
            // Parse handle ID to get line number and old target
            // Handle ID format: "line:{lineNumber}:{target}"
            const parsed = parseHandleId(params.sourceHandle);
            if (parsed && parsed.target !== targetName) {
              // Update local edges state immediately for visual feedback
              // Remove old edge and the new one will come from re-parsing
              setEdges((eds) => eds.filter(e => e.id !== existingEdge.id));
              // Update the underlying data with the specific line number
              onEdgeUpdate?.(params.source, parsed.target, targetName, parsed.lineNumber);
            }
          } else if (params.sourceHandle) {
            // Parse handle ID - if it's a valid divert handle, don't create new
            // This handles the "default" handle case
            const parsed = parseHandleId(params.sourceHandle);
            if (!parsed) {
              // Not a divert handle (e.g., "default"), create new divert
              onEdgeCreate?.(params.source, targetName);
            }
          } else {
            // No source handle, create new divert
            onEdgeCreate?.(params.source, targetName);
          }
        }
      }
    },
    [edges, onEdgeCreate, onEdgeUpdate]
  );

  // Handle edge reconnection (when user drags an edge to a new target)
  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      if (newConnection.source && newConnection.target) {
        // Only allow reconnection from knot nodes
        if (newConnection.source !== '__start__' && newConnection.source !== '__end__') {
          // Parse handle ID to get line number and old target
          const parsed = oldEdge.sourceHandle ? parseHandleId(oldEdge.sourceHandle) : null;
          const newTarget = newConnection.target === '__end__' ? 'END' : newConnection.target;

          if (parsed && parsed.target !== newTarget) {
            // Update the visual state immediately
            setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
            // Update the underlying data with the specific line number
            onEdgeUpdate?.(newConnection.source, parsed.target, newTarget, parsed.lineNumber);
          }
        }
      }
    },
    [onEdgeUpdate]
  );

  // Handle right-click on pane
  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      // Convert screen coordinates to flow coordinates for node placement
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        screenX: event.clientX,
        screenY: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        type: 'canvas',
      });
    },
    [screenToFlowPosition]
  );

  // Handle right-click on node
  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      if (node.id === '__start__' || node.id === '__end__') return;

      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const isRegion = node.id.startsWith('__region__');

      setContextMenu({
        screenX: event.clientX,
        screenY: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        type: isRegion ? 'region' : 'knot',
        nodeId: node.id,
      });
    },
    [screenToFlowPosition]
  );

  // Handle right-click on edge
  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault();
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        screenX: event.clientX,
        screenY: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        type: 'edge',
        edgeId: edge.id,
      });
    },
    [screenToFlowPosition]
  );

  // Handle delete key
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Delete selected nodes
        const selectedNodes = nodes.filter(n => n.selected && n.id !== '__start__' && n.id !== '__end__');
        for (const node of selectedNodes) {
          onNodeDelete?.(node.id);
        }

        // Delete selected edges
        const selectedEdges = edges.filter(e => e.selected);
        for (const edge of selectedEdges) {
          // Extract source and target from edge ID: "source[target]->target"
          const match = edge.id.match(/^([^[]+)\[([^\]]+)\]->/);
          if (match) {
            onEdgeDelete?.(match[1], match[2]);
          }
        }
      }

      if (event.key === 'Escape') {
        onNodeSelect(null);
        setContextMenu(null);
      }
    },
    [nodes, edges, onNodeDelete, onEdgeDelete, onNodeSelect]
  );

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle context menu actions - open knot creation dialog
  const handleAddKnotClick = useCallback(() => {
    if (contextMenu) {
      setKnotDialog({ flowX: contextMenu.flowX, flowY: contextMenu.flowY });
      setKnotNameInput('');
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  // Handle knot creation submit
  const handleKnotSubmit = useCallback(() => {
    if (knotDialog && knotNameInput.trim()) {
      onKnotCreate?.(knotNameInput.trim(), knotDialog.flowX, knotDialog.flowY);
      setKnotDialog(null);
      setKnotNameInput('');
    }
  }, [knotDialog, knotNameInput, onKnotCreate]);

  // Handle knot dialog cancel
  const handleKnotCancel = useCallback(() => {
    setKnotDialog(null);
    setKnotNameInput('');
  }, []);

  // Handle create region from context menu
  const handleCreateRegionClick = useCallback(() => {
    if (contextMenu) {
      setRegionDialog({ flowX: contextMenu.flowX, flowY: contextMenu.flowY });
      setRegionNameInput('');
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  // Handle region creation submit
  const handleRegionSubmit = useCallback(() => {
    if (regionDialog && regionNameInput.trim()) {
      onRegionCreate?.(regionNameInput.trim(), regionDialog.flowX, regionDialog.flowY);
      setRegionDialog(null);
      setRegionNameInput('');
    }
  }, [regionDialog, regionNameInput, onRegionCreate]);

  // Handle region dialog cancel
  const handleRegionCancel = useCallback(() => {
    setRegionDialog(null);
    setRegionNameInput('');
  }, []);

  // Handle rename knot from context menu
  const handleRenameKnotClick = useCallback(() => {
    if (contextMenu?.nodeId && contextMenu.type === 'knot') {
      setRenameDialog({ type: 'knot', oldName: contextMenu.nodeId });
      setRenameInput(contextMenu.nodeId);
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  // Handle rename region from context menu
  const handleRenameRegionClick = useCallback(() => {
    if (contextMenu?.nodeId && contextMenu.type === 'region') {
      const regionName = contextMenu.nodeId.replace('__region__', '');
      setRenameDialog({ type: 'region', oldName: regionName });
      setRenameInput(regionName);
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  // Handle rename submit
  const handleRenameSubmit = useCallback(() => {
    if (renameDialog && renameInput.trim() && renameInput.trim() !== renameDialog.oldName) {
      if (renameDialog.type === 'knot') {
        onKnotRename?.(renameDialog.oldName, renameInput.trim());
      } else {
        onRegionRename?.(renameDialog.oldName, renameInput.trim());
      }
      setRenameDialog(null);
      setRenameInput('');
    }
  }, [renameDialog, renameInput, onKnotRename, onRegionRename]);

  // Handle rename dialog cancel
  const handleRenameCancel = useCallback(() => {
    setRenameDialog(null);
    setRenameInput('');
  }, []);

  const handleDeleteNode = useCallback(() => {
    if (contextMenu?.nodeId) {
      onNodeDelete?.(contextMenu.nodeId);
    }
    closeContextMenu();
  }, [contextMenu, onNodeDelete, closeContextMenu]);

  const handleDeleteEdge = useCallback(() => {
    if (contextMenu?.edgeId) {
      const match = contextMenu.edgeId.match(/^([^[]+)\[([^\]]+)\]->/);
      if (match) {
        onEdgeDelete?.(match[1], match[2]);
      }
    }
    closeContextMenu();
  }, [contextMenu, onEdgeDelete, closeContextMenu]);

  return (
    <div
      className="ink-node-editor"
      ref={reactFlowWrapper}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={inkNodeTypes}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        edgesReconnectable={true}
      >
        <Background color="#333" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.id === '__start__') return '#4caf50';
            if (node.id === '__end__') return '#f44336';
            return '#4ec9b0';
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
      </ReactFlow>

      {/* Drag Hint Tooltip */}
      {dragHint && dragHint.visible && (() => {
        // Convert flow coordinates to screen coordinates for positioning
        const screenPos = flowToScreenPosition({ x: dragHint.x, y: dragHint.y });
        return (
          <div
            className={`ink-drag-hint ${isShiftHeld ? 'shift-held' : ''}`}
            style={{
              left: screenPos.x + 200, // Offset from node center
              top: screenPos.y,
            }}
          >
            {isShiftHeld ? (
              <>Keeping in <strong>{dragHint.regionName}</strong></>
            ) : (
              <>
                Hold <span className="ink-drag-hint-key">Shift</span> to keep in group
              </>
            )}
          </div>
        );
      })()}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="ink-context-menu-overlay"
            onClick={closeContextMenu}
          />
          <div
            className="ink-context-menu"
            style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          >
            {contextMenu.type === 'canvas' && (
              <>
                <button className="ink-context-menu-item" onClick={handleAddKnotClick}>
                  Add Knot
                </button>
                <div className="ink-context-menu-separator" />
                <button className="ink-context-menu-item" onClick={handleCreateRegionClick}>
                  Create Region
                </button>
              </>
            )}
            {contextMenu.type === 'knot' && (
              <>
                <button
                  className="ink-context-menu-item"
                  onClick={() => {
                    onNodeSelect(contextMenu.nodeId!);
                    closeContextMenu();
                  }}
                >
                  Edit
                </button>
                <button
                  className="ink-context-menu-item"
                  onClick={handleRenameKnotClick}
                >
                  Rename
                </button>
                <div className="ink-context-menu-separator" />
                <button
                  className="ink-context-menu-item ink-context-menu-item-danger"
                  onClick={handleDeleteNode}
                >
                  Delete Knot
                </button>
              </>
            )}
            {contextMenu.type === 'region' && (
              <>
                <button
                  className="ink-context-menu-item"
                  onClick={handleRenameRegionClick}
                >
                  Rename
                </button>
                <div className="ink-context-menu-separator" />
                <button
                  className="ink-context-menu-item ink-context-menu-item-danger"
                  onClick={handleDeleteNode}
                >
                  Delete Region
                </button>
              </>
            )}
            {contextMenu.type === 'edge' && (
              <button
                className="ink-context-menu-item ink-context-menu-item-danger"
                onClick={handleDeleteEdge}
              >
                Delete Connection
              </button>
            )}
          </div>
        </>
      )}

      {/* Region Name Dialog */}
      {regionDialog && (
        <div className="ink-dialog-overlay" onClick={handleRegionCancel}>
          <div className="ink-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ink-dialog-header">
              <h3>Create Region</h3>
              <button onClick={handleRegionCancel}>&times;</button>
            </div>
            <div className="ink-dialog-content">
              <label className="ink-dialog-label">
                Region Name
                <input
                  type="text"
                  className="ink-dialog-input"
                  value={regionNameInput}
                  onChange={(e) => setRegionNameInput(e.target.value)}
                  placeholder="e.g., Introduction, Main Story"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRegionSubmit();
                    } else if (e.key === 'Escape') {
                      handleRegionCancel();
                    }
                  }}
                />
              </label>
              <p className="ink-dialog-hint">
                Regions group related knots together. Drag knots into a region to organize your story.
              </p>
            </div>
            <div className="ink-dialog-actions">
              <button className="ink-btn ink-btn-secondary" onClick={handleRegionCancel}>
                Cancel
              </button>
              <button
                className="ink-btn ink-btn-primary"
                onClick={handleRegionSubmit}
                disabled={!regionNameInput.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Knot Name Dialog */}
      {knotDialog && (() => {
        const knotNameTrimmed = knotNameInput.trim();
        const isValidFormat = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(knotNameTrimmed);
        const isDuplicate = existingKnotNames.includes(knotNameTrimmed);
        const canSubmit = knotNameTrimmed && isValidFormat && !isDuplicate;

        return (
          <div className="ink-dialog-overlay" onClick={handleKnotCancel}>
            <div className="ink-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="ink-dialog-header">
                <h3>Add New Knot</h3>
                <button onClick={handleKnotCancel}>&times;</button>
              </div>
              <div className="ink-dialog-content">
                <label className="ink-dialog-label">
                  Knot Name
                  <input
                    type="text"
                    className={`ink-dialog-input ${isDuplicate ? 'ink-dialog-input-error' : ''}`}
                    value={knotNameInput}
                    onChange={(e) => setKnotNameInput(e.target.value)}
                    placeholder="e.g., my_new_knot"
                    autoFocus
                    pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canSubmit) {
                        handleKnotSubmit();
                      } else if (e.key === 'Escape') {
                        handleKnotCancel();
                      }
                    }}
                  />
                </label>
                {isDuplicate ? (
                  <p className="ink-dialog-error">
                    A knot named "{knotNameTrimmed}" already exists.
                  </p>
                ) : (
                  <p className="ink-dialog-hint">
                    Use letters, numbers, and underscores. Must start with a letter or underscore.
                  </p>
                )}
              </div>
              <div className="ink-dialog-actions">
                <button className="ink-btn ink-btn-secondary" onClick={handleKnotCancel}>
                  Cancel
                </button>
                <button
                  className="ink-btn ink-btn-primary"
                  onClick={handleKnotSubmit}
                  disabled={!canSubmit}
                >
                  Add Knot
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rename Dialog */}
      {renameDialog && (() => {
        const newNameTrimmed = renameInput.trim();
        const isValidFormat = renameDialog.type === 'knot'
          ? /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newNameTrimmed)
          : newNameTrimmed.length > 0;
        const existingNames = renameDialog.type === 'knot' ? existingKnotNames : existingRegionNames;
        const isDuplicate = newNameTrimmed !== renameDialog.oldName && existingNames.includes(newNameTrimmed);
        const isUnchanged = newNameTrimmed === renameDialog.oldName;
        const canSubmit = newNameTrimmed && isValidFormat && !isDuplicate && !isUnchanged;

        return (
          <div className="ink-dialog-overlay" onClick={handleRenameCancel}>
            <div className="ink-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="ink-dialog-header">
                <h3>Rename {renameDialog.type === 'knot' ? 'Knot' : 'Region'}</h3>
                <button onClick={handleRenameCancel}>&times;</button>
              </div>
              <div className="ink-dialog-content">
                <label className="ink-dialog-label">
                  New Name
                  <input
                    type="text"
                    className={`ink-dialog-input ${isDuplicate ? 'ink-dialog-input-error' : ''}`}
                    value={renameInput}
                    onChange={(e) => setRenameInput(e.target.value)}
                    placeholder={renameDialog.oldName}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canSubmit) {
                        handleRenameSubmit();
                      } else if (e.key === 'Escape') {
                        handleRenameCancel();
                      }
                    }}
                  />
                </label>
                {isDuplicate ? (
                  <p className="ink-dialog-error">
                    A {renameDialog.type} named "{newNameTrimmed}" already exists.
                  </p>
                ) : renameDialog.type === 'knot' ? (
                  <p className="ink-dialog-hint">
                    All references to this knot will be updated automatically.
                  </p>
                ) : (
                  <p className="ink-dialog-hint">
                    The region will be renamed in the file.
                  </p>
                )}
              </div>
              <div className="ink-dialog-actions">
                <button className="ink-btn ink-btn-secondary" onClick={handleRenameCancel}>
                  Cancel
                </button>
                <button
                  className="ink-btn ink-btn-primary"
                  onClick={handleRenameSubmit}
                  disabled={!canSubmit}
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Wrapper component that provides ReactFlow context
export function InkNodeEditor(props: InkNodeEditorProps) {
  return (
    <ReactFlowProvider>
      <InkNodeEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export default InkNodeEditor;
