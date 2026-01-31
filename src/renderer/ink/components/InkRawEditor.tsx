/**
 * InkRawEditor component
 *
 * Raw text editor with syntax highlighting for ink files.
 */

import { useRef, useCallback, useEffect } from 'react';
import type { InkParseError } from '../parser/inkTypes';

import './InkEditor.css';

export interface InkRawEditorProps {
  /** The raw content */
  content: string;
  /** Parse errors to display */
  errors: InkParseError[];
  /** Callback when content changes */
  onChange: (content: string) => void;
}

/**
 * Tokenize ink content for syntax highlighting
 */
function tokenizeInk(content: string): { type: string; value: string }[] {
  const tokens: { type: string; value: string }[] = [];

  // Split into lines, preserving line breaks
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i > 0) {
      tokens.push({ type: 'newline', value: '\n' });
    }

    if (line.length === 0) {
      continue;
    }

    // Check for knot header
    const knotMatch = line.match(/^(===?\s*)(\w+)(\s*===?)?\s*$/);
    if (knotMatch) {
      tokens.push({ type: 'knot-marker', value: knotMatch[1] });
      tokens.push({ type: 'knot-name', value: knotMatch[2] });
      if (knotMatch[3]) {
        tokens.push({ type: 'knot-marker', value: knotMatch[3] });
      }
      continue;
    }

    // Check for EXTERNAL
    const extMatch = line.match(/^(EXTERNAL\s+)(\w+)(\s*\([^)]*\))?/);
    if (extMatch) {
      tokens.push({ type: 'keyword', value: extMatch[1] });
      tokens.push({ type: 'function-name', value: extMatch[2] });
      if (extMatch[3]) {
        tokens.push({ type: 'params', value: extMatch[3] });
      }
      continue;
    }

    // Check for comment
    const commentMatch = line.match(/^(\s*)(\/\/.*)$/);
    if (commentMatch) {
      if (commentMatch[1]) {
        tokens.push({ type: 'whitespace', value: commentMatch[1] });
      }
      tokens.push({ type: 'comment', value: commentMatch[2] });
      continue;
    }

    // Check for choice
    const choiceMatch = line.match(/^(\s*)(\*|\+)(.*)$/);
    if (choiceMatch) {
      if (choiceMatch[1]) {
        tokens.push({ type: 'whitespace', value: choiceMatch[1] });
      }
      tokens.push({ type: 'choice-marker', value: choiceMatch[2] });
      // Parse rest of choice line for brackets and diverts
      tokenizeChoiceLine(choiceMatch[3], tokens);
      continue;
    }

    // Check for standalone divert
    const divertMatch = line.match(/^(\s*)(->)(\s*)(\w+|END)(\s*)$/);
    if (divertMatch) {
      if (divertMatch[1]) {
        tokens.push({ type: 'whitespace', value: divertMatch[1] });
      }
      tokens.push({ type: 'divert-arrow', value: divertMatch[2] });
      if (divertMatch[3]) {
        tokens.push({ type: 'whitespace', value: divertMatch[3] });
      }
      tokens.push({ type: 'divert-target', value: divertMatch[4] });
      if (divertMatch[5]) {
        tokens.push({ type: 'whitespace', value: divertMatch[5] });
      }
      continue;
    }

    // Regular text - look for inline diverts
    tokenizeTextLine(line, tokens);
  }

  return tokens;
}

/**
 * Tokenize the rest of a choice line (after the * or +)
 */
function tokenizeChoiceLine(text: string, tokens: { type: string; value: string }[]) {
  // Look for [bracketed text]
  const bracketMatch = text.match(/^(\s*)(\[[^\]]*\])(.*)$/);
  if (bracketMatch) {
    if (bracketMatch[1]) {
      tokens.push({ type: 'whitespace', value: bracketMatch[1] });
    }
    tokens.push({ type: 'choice-bracket', value: bracketMatch[2] });
    tokenizeTextLine(bracketMatch[3], tokens);
    return;
  }

  // No brackets, tokenize as regular text
  tokenizeTextLine(text, tokens);
}

/**
 * Tokenize a text line, looking for inline diverts
 */
function tokenizeTextLine(text: string, tokens: { type: string; value: string }[]) {
  const divertPattern = /(->\s*)(\w+|END)/g;
  let lastIndex = 0;
  let match;

  while ((match = divertPattern.exec(text)) !== null) {
    // Add text before the divert
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    tokens.push({ type: 'divert-arrow', value: match[1] });
    tokens.push({ type: 'divert-target', value: match[2] });

    lastIndex = divertPattern.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }
}

/**
 * Render syntax-highlighted ink content
 */
function SyntaxHighlightedInk({ content }: { content: string }) {
  const tokens = tokenizeInk(content);

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={`ink-token ink-token-${token.type}`}>
          {token.value}
        </span>
      ))}
    </>
  );
}

/**
 * Generate line numbers
 */
function LineNumbers({ content, errors }: { content: string; errors: InkParseError[] }) {
  const lineCount = content.split('\n').length;
  const errorLines = new Set(errors.filter(e => e.severity === 'error').map(e => e.lineNumber));
  const warningLines = new Set(errors.filter(e => e.severity === 'warning').map(e => e.lineNumber));

  return (
    <div className="ink-raw-line-numbers">
      {Array.from({ length: lineCount }, (_, i) => {
        const lineNum = i + 1;
        const hasError = errorLines.has(lineNum);
        const hasWarning = warningLines.has(lineNum);

        return (
          <div
            key={i}
            className={`ink-raw-line-number ${hasError ? 'ink-raw-line-error' : ''} ${hasWarning ? 'ink-raw-line-warning' : ''}`}
            title={
              hasError
                ? errors.find(e => e.lineNumber === lineNum)?.message
                : hasWarning
                  ? errors.find(e => e.lineNumber === lineNum)?.message
                  : undefined
            }
          >
            {hasError && <span className="ink-raw-error-dot">!</span>}
            {hasWarning && !hasError && <span className="ink-raw-warning-dot">!</span>}
            {lineNum}
          </div>
        );
      })}
    </div>
  );
}

export function InkRawEditor({ content, errors, onChange }: InkRawEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Also sync line numbers
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const handleScrollAll = useCallback(() => {
    if (textareaRef.current) {
      if (highlightRef.current) {
        highlightRef.current.scrollTop = textareaRef.current.scrollTop;
        highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    }
  }, []);

  return (
    <div className="ink-raw-editor">
      <div className="ink-raw-line-numbers-container" ref={lineNumbersRef}>
        <LineNumbers content={content} errors={errors} />
      </div>
      <div className="ink-raw-content">
        <div className="ink-raw-highlight" ref={highlightRef}>
          <SyntaxHighlightedInk content={content} />
        </div>
        <textarea
          ref={textareaRef}
          className="ink-raw-textarea"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScrollAll}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
}

export default InkRawEditor;
