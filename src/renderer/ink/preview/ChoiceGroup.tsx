/**
 * ChoiceGroup Component
 *
 * Displays a group of player choices.
 * Supports labeled choices with <label> syntax where label is displayed prominently
 * and the text is shown in a smaller, curvy style below.
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
      {choices.map((choice, index) => {
        const hasLabel = !!choice.label;
        const displayText = hasLabel ? choice.label : choice.text;
        const subText = hasLabel ? choice.text : null;

        return (
          <button
            key={index}
            className={`choice-group__choice ${choice.isSticky ? 'choice-group__choice--sticky' : ''} ${!displayText ? 'choice-group__choice--empty' : ''} ${hasLabel ? 'choice-group__choice--labeled' : ''} ${choice.isDangling ? 'choice-group__choice--dangling' : ''}`}
            onClick={() => onChoiceClick?.(index)}
            disabled={disabled}
            type="button"
            title={choice.isDangling ? 'This choice has no divert target' : undefined}
          >
            <span className="choice-group__choice-prefix">
              {choice.isSticky ? '+' : '*'}
            </span>
            <span className="choice-group__choice-content">
              <span className="choice-group__choice-text">
                {displayText || <em className="choice-group__choice-placeholder">(click to edit choice text)</em>}
              </span>
              {subText && (
                <span className="choice-group__choice-subtext">
                  {subText}
                </span>
              )}
            </span>
            {choice.divert && (
              <span className="choice-group__choice-divert">
                → {choice.divert}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default ChoiceGroup;
