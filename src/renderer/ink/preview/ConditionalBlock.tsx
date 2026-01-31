/**
 * ConditionalBlock Component
 *
 * Displays a conditional block with multiple branches.
 */

import type { ConditionalBlockProps } from './types';
import './Preview.css';

export function ConditionalBlock({
  branches,
  onClick,
}: ConditionalBlockProps) {
  return (
    <div className="conditional-block" onClick={onClick}>
      <div className="conditional-block__header">Conditional</div>
      {branches.map((branch, index) => (
        <div
          key={index}
          className={`conditional-block__branch ${branch.isElse ? 'conditional-block__branch--else' : ''}`}
        >
          <div className="conditional-block__branch-header">
            {branch.isElse
              ? '- else:'
              : `- GetStoryFlag("${branch.flagName}"):`}
          </div>
          {branch.content.length > 0 && (
            <div className="conditional-block__branch-content">
              {branch.content.map((item, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#888' }}>
                  {item.type === 'text' ? item.content : `[${item.type}]`}
                </div>
              ))}
            </div>
          )}
          {branch.divert && (
            <div style={{ fontSize: '12px', color: '#88c0d0', marginTop: '4px' }}>
              → {branch.divert}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ConditionalBlock;
