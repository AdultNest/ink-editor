/**
 * FlagsPanel component
 *
 * Sidebar panel displaying all story flags used in the ink file.
 * Shows flags grouped by operation type (set, remove, check).
 */

import { useMemo } from 'react';
import type { ParsedInk, InkStoryFlag } from '../parser/inkTypes';

import './FlagsPanel.css';

export interface FlagsPanelProps {
  /** The parsed ink data */
  parsedInk: ParsedInk | null;
  /** Callback when a flag is clicked */
  onFlagClick?: (flagName: string, lineNumber: number) => void;
  /** Currently selected knot name (to highlight related flags) */
  selectedKnotId?: string | null;
}

interface FlagUsage {
  name: string;
  setCount: number;
  removeCount: number;
  checkCount: number;
  occurrences: Array<{
    operation: InkStoryFlag['operation'];
    lineNumber: number;
    knotName: string;
    divertTarget?: string;
  }>;
}

export function FlagsPanel({ parsedInk, onFlagClick, selectedKnotId }: FlagsPanelProps) {
  // Collect all flag usages across all knots
  const flagUsages = useMemo(() => {
    if (!parsedInk) return [];

    const flagMap = new Map<string, FlagUsage>();

    for (const knot of parsedInk.knots) {
      for (const flag of knot.storyFlags) {
        let usage = flagMap.get(flag.name);
        if (!usage) {
          usage = {
            name: flag.name,
            setCount: 0,
            removeCount: 0,
            checkCount: 0,
            occurrences: [],
          };
          flagMap.set(flag.name, usage);
        }

        if (flag.operation === 'set') usage.setCount++;
        else if (flag.operation === 'remove') usage.removeCount++;
        else if (flag.operation === 'check') usage.checkCount++;

        usage.occurrences.push({
          operation: flag.operation,
          lineNumber: flag.lineNumber,
          knotName: knot.name,
          divertTarget: flag.divertTarget,
        });
      }
    }

    // Sort flags alphabetically
    return Array.from(flagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [parsedInk]);

  // Find flags related to the selected knot
  const selectedKnotFlags = useMemo(() => {
    if (!selectedKnotId || !parsedInk) return new Set<string>();

    const knot = parsedInk.knots.find(k => k.name === selectedKnotId);
    if (!knot) return new Set<string>();

    return new Set(knot.storyFlags.map(f => f.name));
  }, [selectedKnotId, parsedInk]);

  if (!parsedInk) {
    return (
      <div className="flags-panel">
        <div className="flags-panel-header">
          <h3 className="flags-panel-title">Story Flags</h3>
        </div>
        <div className="flags-panel-empty">
          No file loaded
        </div>
      </div>
    );
  }

  if (flagUsages.length === 0) {
    return (
      <div className="flags-panel">
        <div className="flags-panel-header">
          <h3 className="flags-panel-title">Story Flags</h3>
        </div>
        <div className="flags-panel-empty">
          No story flags found.
          <div className="flags-panel-hint">
            Use <code>~ SetStoryFlag("flag_name")</code> to set a flag.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flags-panel">
      <div className="flags-panel-header">
        <h3 className="flags-panel-title">Story Flags</h3>
        <span className="flags-panel-count">{flagUsages.length}</span>
      </div>

      <div className="flags-panel-list">
        {flagUsages.map(usage => {
          const isRelatedToSelected = selectedKnotFlags.has(usage.name);

          return (
            <div
              key={usage.name}
              className={`flags-panel-item ${isRelatedToSelected ? 'flags-panel-item-highlight' : ''}`}
            >
              <div className="flags-panel-item-header">
                <span className="flags-panel-flag-name">{usage.name}</span>
                <div className="flags-panel-badges">
                  {usage.setCount > 0 && (
                    <span className="flags-panel-badge flags-panel-badge-set" title="Times set">
                      +{usage.setCount}
                    </span>
                  )}
                  {usage.removeCount > 0 && (
                    <span className="flags-panel-badge flags-panel-badge-remove" title="Times removed">
                      −{usage.removeCount}
                    </span>
                  )}
                  {usage.checkCount > 0 && (
                    <span className="flags-panel-badge flags-panel-badge-check" title="Times checked">
                      ?{usage.checkCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="flags-panel-occurrences">
                {usage.occurrences.map((occ, idx) => (
                  <div
                    key={idx}
                    className={`flags-panel-occurrence ${occ.knotName === selectedKnotId ? 'flags-panel-occurrence-selected' : ''}`}
                    onClick={() => onFlagClick?.(usage.name, occ.lineNumber)}
                    title={`Line ${occ.lineNumber}`}
                  >
                    <span className={`flags-panel-op flags-panel-op-${occ.operation}`}>
                      {occ.operation === 'set' && 'SET'}
                      {occ.operation === 'remove' && 'DEL'}
                      {occ.operation === 'check' && 'IF'}
                    </span>
                    <span className="flags-panel-knot-name">{occ.knotName}</span>
                    {occ.divertTarget && (
                      <span className="flags-panel-divert">
                        → {occ.divertTarget}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FlagsPanel;
