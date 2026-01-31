/**
 * MessageComposer Component
 *
 * WhatsApp-style message input with:
 * - Text input field
 * - Enter = send NPC text message
 * - Alt+Enter = send player choice (single prompt)
 * - Ctrl+Enter = newline in message
 * - "+" button for special content types (images, videos, etc.)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { KnotContentItemType } from '../parser/inkTypes';

import './MessageComposer.css';

export interface MessageComposerProps {
  /** Callback to add a text message */
  onAddText: (text: string) => void;
  /** Callback to add a choice (single prompt) */
  onAddChoice: (text: string) => void;
  /** Callback to add special content (opens picker/editor) */
  onAddSpecial: (type: KnotContentItemType) => void;
  /** Whether there are validation errors preventing apply */
  hasErrors?: boolean;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether to auto-focus the input */
  autoFocus?: boolean;
}

// Special content types accessible from "+" menu
const SPECIAL_TYPES: Array<{
  type: KnotContentItemType;
  label: string;
  icon: string;
  description: string;
}> = [
  { type: 'image', label: 'NPC Image', icon: '🖼️', description: 'Image sent by character' },
  { type: 'player-image', label: 'Player Image', icon: '📱', description: 'Image sent by player' },
  { type: 'video', label: 'NPC Video', icon: '🎬', description: 'Video sent by character' },
  { type: 'player-video', label: 'Player Video', icon: '📹', description: 'Video sent by player' },
  { type: 'choice', label: 'Choice', icon: '❓', description: 'Add player choice with optional divert' },
  { type: 'divert', label: 'Divert', icon: '➡️', description: 'Jump to another knot' },
  { type: 'fake-type', label: 'Typing Indicator', icon: '⌨️', description: 'Show typing animation' },
  { type: 'wait', label: 'Wait/Pause', icon: '⏸️', description: 'Pause for N seconds' },
  { type: 'transition', label: 'Transition', icon: '🎭', description: 'Scene/chapter transition' },
  { type: 'side-story', label: 'Side Story', icon: '📖', description: 'Trigger side content' },
  { type: 'flag-operation', label: 'Set/Remove Flag', icon: '🚩', description: 'Modify story flags' },
  { type: 'raw', label: 'Raw Ink', icon: '📝', description: 'Custom ink syntax' },
];

export function MessageComposer({
  onAddText,
  onAddChoice,
  onAddSpecial,
  hasErrors = false,
  placeholder = 'Type a message...',
  autoFocus = true,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [text]);

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter or Shift+Enter = newline
      if ((e.ctrlKey || e.shiftKey) && e.key === 'Enter') {
        return; // Allow default behavior (newline)
      }

      // Alt+Enter = send as choice (single prompt)
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        const trimmed = text.trim();
        if (trimmed) {
          onAddChoice(trimmed);
          setText('');
        }
        return;
      }

      // Enter = send as NPC text
      if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const trimmed = text.trim();
        if (trimmed) {
          onAddText(trimmed);
          setText('');
        }
        return;
      }

      // Escape = close menu if open
      if (e.key === 'Escape' && showMenu) {
        setShowMenu(false);
      }
    },
    [text, onAddText, onAddChoice, showMenu]
  );

  // Handle special content selection
  const handleSpecialSelect = useCallback(
    (type: KnotContentItemType) => {
      setShowMenu(false);
      onAddSpecial(type);
    },
    [onAddSpecial]
  );

  // Toggle menu
  const toggleMenu = useCallback(() => {
    setShowMenu((prev) => !prev);
  }, []);

  return (
    <div className="message-composer">
      {/* Special content menu */}
      {showMenu && (
        <div className="message-composer__menu" ref={menuRef}>
          <div className="message-composer__menu-header">Add Content</div>
          <div className="message-composer__menu-grid">
            {SPECIAL_TYPES.map(({ type, label, icon, description }) => (
              <button
                key={type}
                className="message-composer__menu-item"
                onClick={() => handleSpecialSelect(type)}
                title={description}
              >
                <span className="message-composer__menu-icon">{icon}</span>
                <span className="message-composer__menu-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="message-composer__input-area">
        {/* Plus button */}
        <button
          className={`message-composer__plus-btn ${showMenu ? 'message-composer__plus-btn--active' : ''}`}
          onClick={toggleMenu}
          title="Add media or special content"
          type="button"
        >
          <span className="message-composer__plus-icon">+</span>
        </button>

        {/* Text input */}
        <div className="message-composer__input-wrapper">
          <textarea
            ref={textareaRef}
            className="message-composer__input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
          />
        </div>

        {/* Send button */}
        <button
          className="message-composer__send-btn"
          onClick={() => {
            const trimmed = text.trim();
            if (trimmed) {
              onAddText(trimmed);
              setText('');
            }
          }}
          disabled={!text.trim()}
          title="Send message (Enter)"
          type="button"
        >
          <span className="message-composer__send-icon">↵</span>
        </button>
      </div>

      {/* Hint text */}
      <div className="message-composer__hints">
        <span className="message-composer__hint">
          <kbd>Enter</kbd> NPC message
        </span>
        <span className="message-composer__hint">
          <kbd>Alt+Enter</kbd> Player choice
        </span>
        <span className="message-composer__hint">
          <kbd>Ctrl+Enter</kbd> New line
        </span>
      </div>
    </div>
  );
}

export default MessageComposer;
