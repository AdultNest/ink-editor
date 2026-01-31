/**
 * ChoiceGroup Component
 *
 * Displays a group of player choices.
 */

import type { ChoiceGroupProps } from './types';
import './Preview.css';

export function ChoiceGroup({
  choices,
  onChoiceClick,
  disabled = false,
}: ChoiceGroupProps) {
  return (
    <div className="choice-group">
      {choices.map((choice, index) => (
        <button
          key={index}
          className={`choice-group__choice ${choice.isSticky ? 'choice-group__choice--sticky' : ''} ${!choice.text ? 'choice-group__choice--empty' : ''}`}
          onClick={() => onChoiceClick?.(index)}
          disabled={disabled}
          type="button"
        >
          <span className="choice-group__choice-prefix">
            {choice.isSticky ? '+' : '*'}
          </span>
          <span className="choice-group__choice-text">
            {choice.text || <em className="choice-group__choice-placeholder">(click to edit choice text)</em>}
          </span>
          {choice.divert && (
            <span className="choice-group__choice-divert">
              → {choice.divert}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default ChoiceGroup;
