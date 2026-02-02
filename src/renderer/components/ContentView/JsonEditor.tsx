/**
 * JsonEditor component
 *
 * Basic JSON editor with syntax highlighting, collapsing, and editing capabilities.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './JsonEditor.css';

export interface JsonEditorProps {
  /** The file path to the JSON file */
  filePath: string;
  /** The file name to display */
  fileName: string;
  /** Called when the file is saved */
  onSave?: (content: string) => void;
  /** Called when dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void;
}

interface JsonNode {
  key: string;
  value: unknown;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  path: string;
  depth: number;
}

/**
 * Tokenizes JSON for syntax highlighting
 */
function tokenizeJson(json: string): { type: string; value: string }[] {
  const tokens: { type: string; value: string }[] = [];
  const regex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}\[\],:])|(\s+)/g;

  let match;
  let lastIndex = 0;

  while ((match = regex.exec(json)) !== null) {
    // Add any unmatched text
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: json.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // Property key
      tokens.push({ type: 'key', value: match[1] });
      tokens.push({ type: 'punctuation', value: ':' });
    } else if (match[2]) {
      // String value
      tokens.push({ type: 'string', value: match[2] });
    } else if (match[3]) {
      // Number
      tokens.push({ type: 'number', value: match[3] });
    } else if (match[4]) {
      // Boolean
      tokens.push({ type: 'boolean', value: match[4] });
    } else if (match[5]) {
      // Null
      tokens.push({ type: 'null', value: match[5] });
    } else if (match[6]) {
      // Punctuation
      tokens.push({ type: 'punctuation', value: match[6] });
    } else if (match[7]) {
      // Whitespace
      tokens.push({ type: 'whitespace', value: match[7] });
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < json.length) {
    tokens.push({ type: 'text', value: json.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Renders syntax-highlighted JSON
 */
function SyntaxHighlightedJson({ content }: { content: string }) {
  const tokens = tokenizeJson(content);

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={`json-token json-${token.type}`}>
          {token.value}
        </span>
      ))}
    </>
  );
}

/**
 * Collapsible JSON tree view
 */
function JsonTreeView({
  data,
  onChange,
  path = '',
  depth = 0
}: {
  data: unknown;
  onChange: (path: string, value: unknown) => void;
  path?: string;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (nodePath: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(nodePath)) {
        next.delete(nodePath);
      } else {
        next.add(nodePath);
      }
      return next;
    });
  };

  const renderValue = (value: unknown, key: string, currentPath: string): JSX.Element => {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;

    if (value === null) {
      return <span className="json-null">null</span>;
    }

    if (typeof value === 'boolean') {
      return (
        <span
          className="json-boolean json-editable"
          onClick={() => onChange(fullPath, !value)}
          title="Click to toggle"
        >
          {value.toString()}
        </span>
      );
    }

    if (typeof value === 'number') {
      return <span className="json-number">{value}</span>;
    }

    if (typeof value === 'string') {
      return <span className="json-string">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      const isCollapsed = collapsed.has(fullPath);
      return (
        <span className="json-array">
          <span
            className="json-collapse-btn"
            onClick={() => toggleCollapse(fullPath)}
          >
            {isCollapsed ? '▶' : '▼'}
          </span>
          <span className="json-bracket">[</span>
          {isCollapsed ? (
            <span className="json-collapsed-indicator" onClick={() => toggleCollapse(fullPath)}>
              {value.length} items
            </span>
          ) : (
            <>
              <div className="json-children">
                {value.map((item, index) => (
                  <div key={index} className="json-property">
                    <span className="json-index">{index}</span>
                    <span className="json-colon">: </span>
                    {renderValue(item, String(index), fullPath)}
                    {index < value.length - 1 && <span className="json-comma">,</span>}
                  </div>
                ))}
              </div>
            </>
          )}
          <span className="json-bracket">]</span>
        </span>
      );
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      const isCollapsed = collapsed.has(fullPath);
      return (
        <span className="json-object">
          <span
            className="json-collapse-btn"
            onClick={() => toggleCollapse(fullPath)}
          >
            {isCollapsed ? '▶' : '▼'}
          </span>
          <span className="json-bracket">{'{'}</span>
          {isCollapsed ? (
            <span className="json-collapsed-indicator" onClick={() => toggleCollapse(fullPath)}>
              {entries.length} properties
            </span>
          ) : (
            <>
              <div className="json-children">
                {entries.map(([k, v], index) => (
                  <div key={k} className="json-property">
                    <span className="json-key">"{k}"</span>
                    <span className="json-colon">: </span>
                    {renderValue(v, k, fullPath)}
                    {index < entries.length - 1 && <span className="json-comma">,</span>}
                  </div>
                ))}
              </div>
            </>
          )}
          <span className="json-bracket">{'}'}</span>
        </span>
      );
    }

    return <span>{String(value)}</span>;
  };

  if (typeof data === 'object' && data !== null) {
    return (
      <div className="json-tree">
        {renderValue(data, '', '')}
      </div>
    );
  }

  return <div className="json-tree">{renderValue(data, '', '')}</div>;
}

/**
 * JsonEditor - Main component
 */
export function JsonEditor({ filePath, fileName, onDirtyChange }: JsonEditorProps) {
  const [content, setContent] = useState<string>('');
  const [parsedJson, setParsedJson] = useState<unknown>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Notify parent of dirty state changes (use ref to avoid infinite loops)
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const prevDirtyRef = useRef(isDirty);
  useEffect(() => {
    if (prevDirtyRef.current !== isDirty) {
      prevDirtyRef.current = isDirty;
      onDirtyChangeRef.current?.(isDirty);
    }
  }, [isDirty]);

  // Load file content
  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setIsLoading(true);
      setError(null);
      setParseError(null);

      try {
        const fileContent = await window.electronAPI.readFile(filePath);
        if (isMounted) {
          setContent(fileContent);
          try {
            const parsed = JSON.parse(fileContent);
            setParsedJson(parsed);
          } catch (e) {
            setParseError(e instanceof Error ? e.message : 'Invalid JSON');
          }
          setIsLoading(false);
          setIsDirty(false);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Failed to load file';
          setError(message);
          setIsLoading(false);
        }
      }
    }

    loadFile();

    return () => {
      isMounted = false;
    };
  }, [filePath]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setIsDirty(true);
    try {
      const parsed = JSON.parse(newContent);
      setParsedJson(parsed);
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, []);

  const handleFormat = useCallback(() => {
    if (parsedJson) {
      const formatted = JSON.stringify(parsedJson, null, 2);
      setContent(formatted);
      setIsDirty(true);
    }
  }, [parsedJson]);

  const handleSave = useCallback(async () => {
    if (!isDirty || parseError) return;

    setIsSaving(true);
    try {
      // Format before saving
      const formatted = JSON.stringify(parsedJson, null, 2);
      await window.electronAPI.writeFile(filePath, formatted);
      setContent(formatted);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, parsedJson, isDirty, parseError]);

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleTreeChange = useCallback((path: string, value: unknown) => {
    if (!parsedJson) return;

    // Deep clone and update
    const newJson = JSON.parse(JSON.stringify(parsedJson));
    const parts = path.split('.').filter(Boolean);
    let current: Record<string, unknown> = newJson;

    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]] as Record<string, unknown>;
    }

    if (parts.length > 0) {
      current[parts[parts.length - 1]] = value;
    }

    setParsedJson(newJson);
    setContent(JSON.stringify(newJson, null, 2));
    setIsDirty(true);
  }, [parsedJson]);

  if (isLoading) {
    return (
      <div className="content-view content-view-loading">
        <div className="content-view-spinner" />
        <span>Loading {fileName}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-view content-view-error">
        <span className="content-view-error-icon">!</span>
        <span className="content-view-error-message">{error}</span>
      </div>
    );
  }

  return (
    <div className="content-view json-editor">
      <div className="json-editor-toolbar">
        <div className="json-editor-tabs">
          <button
            className={`json-editor-tab ${viewMode === 'tree' ? 'active' : ''}`}
            onClick={() => setViewMode('tree')}
          >
            Tree
          </button>
          <button
            className={`json-editor-tab ${viewMode === 'raw' ? 'active' : ''}`}
            onClick={() => setViewMode('raw')}
          >
            Raw
          </button>
        </div>
        <div className="json-editor-actions">
          {parseError && (
            <span className="json-editor-error" title={parseError}>
              Invalid JSON
            </span>
          )}
          {isDirty && !parseError && (
            <span className="json-editor-dirty">Modified</span>
          )}
          <button
            className="json-editor-btn"
            onClick={handleFormat}
            disabled={!!parseError}
            title="Format JSON"
          >
            Format
          </button>
          <button
            className="json-editor-btn json-editor-btn-primary"
            onClick={handleSave}
            disabled={!isDirty || !!parseError || isSaving}
            title="Save (Ctrl+S)"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <span className="json-editor-filename">{fileName}</span>
      </div>
      <div className="json-editor-content">
        {viewMode === 'tree' && parsedJson ? (
          <div className="json-tree-container">
            <JsonTreeView data={parsedJson} onChange={handleTreeChange} />
          </div>
        ) : (
          <div className="json-raw-container">
            <div className="json-raw-highlight">
              <SyntaxHighlightedJson content={content} />
            </div>
            <textarea
              ref={textareaRef}
              className="json-raw-textarea"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default JsonEditor;
