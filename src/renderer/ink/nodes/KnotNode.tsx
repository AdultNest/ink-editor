/**
 * KnotNode component
 *
 * Represents a knot (section) in the ink file graph.
 * Shows the full content with one input handle and multiple output handles
 * (one per divert, labeled with target name).
 * Conditional diverts (behind flag checks) are displayed in a separate section.
 */

import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { KnotNodeData, InkDivert } from '../parser/inkTypes';
import { stripPositionComment } from '../parser/inkGenerator';

import './InkNodes.css';

export type KnotNodeType = Node<KnotNodeData, 'knotNode'>;

/**
 * Get display text for a divert handle
 * Returns { label, subtext } for labeled choices, or just { label } for others
 */
function getDivertLabel(divert: InkDivert): { label: string; subtext?: string } {
  if (divert.context === 'choice') {
    // If there's an explicit label, show that as main text and choiceText as subtext
    if (divert.choiceLabel) {
      const label = divert.choiceLabel.length > 20
        ? divert.choiceLabel.substring(0, 17) + '...'
        : divert.choiceLabel;
      const subtext = divert.choiceText && divert.choiceText.length > 30
        ? divert.choiceText.substring(0, 27) + '...'
        : divert.choiceText;
      return { label, subtext };
    }
    // No explicit label, use choice text
    if (divert.choiceText) {
      const text = divert.choiceText;
      if (text.length > 25) {
        return { label: text.substring(0, 22) + '...' };
      }
      return { label: text };
    }
  }
  return { label: divert.target };
}

/**
 * Get display text for a conditional divert
 */
function getConditionalDivertLabel(divert: InkDivert): string {
  if (divert.isElseBranch) {
    return `else → ${divert.target}`;
  }
  if (divert.conditionFlag) {
    const flagName = divert.conditionFlag;
    // Truncate long flag names
    const displayFlag = flagName.length > 15 ? flagName.substring(0, 12) + '...' : flagName;
    return `${displayFlag} → ${divert.target}`;
  }
  return divert.target;
}

/**
 * Get a unique handle ID for a divert
 * Format: "line:{lineNumber}:{target}" - encodes line number for identification
 */
function getDivertHandleId(divert: InkDivert): string {
  return `line:${divert.lineNumber}:${divert.target}`;
}

/**
 * Parse a handle ID back to its components
 */
export function parseHandleId(handleId: string): { lineNumber: number; target: string } | null {
  const match = handleId.match(/^line:(\d+):(.+)$/);
  if (match) {
    return {
      lineNumber: parseInt(match[1], 10),
      target: match[2],
    };
  }
  return null;
}

function KnotNode({ data, selected }: NodeProps<KnotNodeType>) {
  const { name, bodyContent, diverts, conditionalDiverts, storyFlags, hasErrors } = data;

  // Strip position comment from display content
  const displayContent = useMemo(() => stripPositionComment(bodyContent), [bodyContent]);

  // Check if there are any story flags being set/removed in this knot
  const hasSetFlags = storyFlags?.some(f => f.operation === 'set') ?? false;
  const hasRemoveFlags = storyFlags?.some(f => f.operation === 'remove') ?? false;

  return (
    <div
      className={`ink-node ink-knot-node ${hasErrors ? 'ink-node-error' : ''} ${
        selected ? 'ink-node-selected' : ''
      }`}
    >
      {/* Input handle at left */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="ink-handle ink-handle-target"
      />

      {/* Header with knot name */}
      <div className="ink-knot-header">
        <span className="ink-knot-name">=== {name} ===</span>
        {/* Flag indicators */}
        {(hasSetFlags || hasRemoveFlags) && (
          <div className="ink-knot-flag-indicators">
            {hasSetFlags && (
              <span className="ink-knot-flag-badge ink-knot-flag-badge-set" title="Sets flag(s)">
                +🚩
              </span>
            )}
            {hasRemoveFlags && (
              <span className="ink-knot-flag-badge ink-knot-flag-badge-remove" title="Removes flag(s)">
                −🚩
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body content */}
      <div className="ink-knot-body">
        <pre className="ink-knot-content">{displayContent || '(empty)'}</pre>
      </div>

      {/* Regular output handles - one per divert */}
      <div className="ink-knot-handles">
        {diverts.map((divert) => {
          const labelInfo = getDivertLabel(divert);
          return (
            <div key={getDivertHandleId(divert)} className={`ink-knot-handle-row ${labelInfo.subtext ? 'ink-knot-handle-row-labeled' : ''}`}>
              <span className="ink-knot-handle-label">
                {divert.context === 'choice' ? '* ' : '-> '}
                <span className="ink-knot-handle-label-text">{labelInfo.label}</span>
                {labelInfo.subtext && (
                  <span className="ink-knot-handle-label-subtext">{labelInfo.subtext}</span>
                )}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={getDivertHandleId(divert)}
                className="ink-handle ink-handle-source ink-handle-divert"
                style={{ position: 'relative', top: 0, right: 0, transform: 'none' }}
              />
            </div>
          );
        })}
        {diverts.length === 0 && conditionalDiverts.length === 0 && (
          <div className="ink-knot-no-diverts">
            <span className="ink-knot-no-diverts-text">No diverts</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="default"
              className="ink-handle ink-handle-source"
            />
          </div>
        )}
      </div>

      {/* Conditional diverts section - displayed separately */}
      {conditionalDiverts.length > 0 && (
        <div className="ink-knot-conditional-section">
          <div className="ink-knot-conditional-header">
            <span className="ink-knot-conditional-title">Conditional</span>
          </div>
          <div className="ink-knot-handles ink-knot-conditional-handles">
            {conditionalDiverts.map((divert) => (
              <div
                key={getDivertHandleId(divert)}
                className={`ink-knot-handle-row ink-knot-handle-row-conditional ${
                  divert.isElseBranch ? 'ink-knot-handle-row-else' : ''
                }`}
              >
                <span className="ink-knot-handle-label ink-knot-conditional-label">
                  {divert.isElseBranch ? (
                    <span className="ink-knot-else-badge">else</span>
                  ) : (
                    <span className="ink-knot-condition-flag" title={divert.conditionFlag}>
                      {divert.conditionFlag && divert.conditionFlag.length > 12
                        ? divert.conditionFlag.substring(0, 9) + '...'
                        : divert.conditionFlag}
                    </span>
                  )}
                  <span className="ink-knot-conditional-arrow">→</span>
                  <span className="ink-knot-conditional-target">{divert.target}</span>
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={getDivertHandleId(divert)}
                  className="ink-handle ink-handle-source ink-handle-conditional"
                  style={{ position: 'relative', top: 0, right: 0, transform: 'none' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(KnotNode);
