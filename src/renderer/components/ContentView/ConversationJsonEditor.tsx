/**
 * ConversationJsonEditor component
 *
 * Special form-based editor for conversation JSON files (with neighboring .ink file).
 * Supports both regular conversation format and injection format.
 */

import { useState, useEffect, useCallback } from 'react';
import './JsonEditor.css';

export interface ConversationJsonEditorProps {
  filePath: string;
  fileName: string;
  /** Default format to use - 'conversation' or 'injection' */
  defaultFormat?: 'conversation' | 'injection';
}

// Regular conversation format
interface ConversationJson {
  storyId: string;
  contactID: string;
  nextStoryId?: string;
  isStartingStory?: boolean;
  forceTimeInHours?: number;
  passTimeInMinutes?: number;
  timeIsExact?: boolean;
  forceDay?: number;
  isSideStory?: boolean;
}

// Injection format
interface InjectionConversation {
  contactId: string;
  senderId: string;
  inkFilePath: string;
}

interface InjectionJson {
  injectionId: string;
  conversationsToReceive: InjectionConversation[];
}

type ConversationData = ConversationJson | InjectionJson;

function isInjectionFormat(data: ConversationData): data is InjectionJson {
  return 'injectionId' in data && 'conversationsToReceive' in data;
}

const DEFAULT_CONVERSATION: ConversationJson = {
  storyId: '',
  contactID: '',
  nextStoryId: '',
  isStartingStory: false,
  forceTimeInHours: 12,
  passTimeInMinutes: 0,
  timeIsExact: false,
  forceDay: 0,
  isSideStory: false,
};

const DEFAULT_INJECTION: InjectionJson = {
  injectionId: '',
  conversationsToReceive: [],
};

const DAY_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export function ConversationJsonEditor({ filePath, fileName, defaultFormat }: ConversationJsonEditorProps) {
  const [data, setData] = useState<ConversationData>(DEFAULT_CONVERSATION);
  const [originalData, setOriginalData] = useState<ConversationData>(DEFAULT_CONVERSATION);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [format, setFormat] = useState<'conversation' | 'injection'>(defaultFormat || 'conversation');

  const isDirty = JSON.stringify(data) !== JSON.stringify(originalData);

  // Load file
  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await window.electronAPI.readFile(filePath);
        const parsed = JSON.parse(content);

        if (isMounted) {
          // Detect format from content, or use defaultFormat for new/empty files
          if (isInjectionFormat(parsed)) {
            setFormat('injection');
            setData({ ...DEFAULT_INJECTION, ...parsed });
            setOriginalData({ ...DEFAULT_INJECTION, ...parsed });
          } else if ('storyId' in parsed || 'contactID' in parsed) {
            setFormat('conversation');
            setData({ ...DEFAULT_CONVERSATION, ...parsed });
            setOriginalData({ ...DEFAULT_CONVERSATION, ...parsed });
          } else {
            // Empty or unrecognized format - use defaultFormat
            const useFormat = defaultFormat || 'conversation';
            setFormat(useFormat);
            if (useFormat === 'injection') {
              setData({ ...DEFAULT_INJECTION, ...parsed });
              setOriginalData({ ...DEFAULT_INJECTION, ...parsed });
            } else {
              setData({ ...DEFAULT_CONVERSATION, ...parsed });
              setOriginalData({ ...DEFAULT_CONVERSATION, ...parsed });
            }
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
          setIsLoading(false);
        }
      }
    }

    loadFile();
    return () => { isMounted = false; };
  }, [filePath, defaultFormat]);

  const handleConversationChange = useCallback(<K extends keyof ConversationJson>(
    field: K,
    value: ConversationJson[K]
  ) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleInjectionChange = useCallback(<K extends keyof InjectionJson>(
    field: K,
    value: InjectionJson[K]
  ) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleConversationItemChange = useCallback((
    index: number,
    field: keyof InjectionConversation,
    value: string
  ) => {
    if (!isInjectionFormat(data)) return;

    const newConversations = [...data.conversationsToReceive];
    newConversations[index] = { ...newConversations[index], [field]: value };
    setData({ ...data, conversationsToReceive: newConversations });
  }, [data]);

  const addConversationItem = useCallback(() => {
    if (!isInjectionFormat(data)) return;

    setData({
      ...data,
      conversationsToReceive: [
        ...data.conversationsToReceive,
        { contactId: '', senderId: '', inkFilePath: '' },
      ],
    });
  }, [data]);

  const removeConversationItem = useCallback((index: number) => {
    if (!isInjectionFormat(data)) return;

    const newConversations = data.conversationsToReceive.filter((_, i) => i !== index);
    setData({ ...data, conversationsToReceive: newConversations });
  }, [data]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const content = JSON.stringify(data, null, 4);
      await window.electronAPI.writeFile(filePath, content);
      setOriginalData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, data]);

  const switchFormat = useCallback((newFormat: 'conversation' | 'injection') => {
    if (newFormat === format) return;

    if (newFormat === 'injection') {
      setData(DEFAULT_INJECTION);
    } else {
      setData(DEFAULT_CONVERSATION);
    }
    setFormat(newFormat);
  }, [format]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isDirty]);

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
    <div className="content-view json-form-editor">
      <div className="json-editor-toolbar">
        <div className="json-editor-tabs">
          <button
            className={`json-editor-tab ${format === 'conversation' ? 'active' : ''}`}
            onClick={() => switchFormat('conversation')}
          >
            Conversation
          </button>
          <button
            className={`json-editor-tab ${format === 'injection' ? 'active' : ''}`}
            onClick={() => switchFormat('injection')}
          >
            Injection
          </button>
        </div>
        <div className="json-editor-actions">
          {isDirty && <span className="json-editor-dirty">Modified</span>}
          <button
            className="json-editor-btn json-editor-btn-primary"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <span className="json-editor-filename">{fileName}</span>
      </div>

      <div className="json-form-content">
        {format === 'conversation' && !isInjectionFormat(data) ? (
          <ConversationForm
            data={data}
            onChange={handleConversationChange}
          />
        ) : isInjectionFormat(data) ? (
          <InjectionForm
            data={data}
            onChange={handleInjectionChange}
            onItemChange={handleConversationItemChange}
            onAddItem={addConversationItem}
            onRemoveItem={removeConversationItem}
          />
        ) : null}
      </div>
    </div>
  );
}

// Conversation form component
function ConversationForm({
  data,
  onChange,
}: {
  data: ConversationJson;
  onChange: <K extends keyof ConversationJson>(field: K, value: ConversationJson[K]) => void;
}) {
  return (
    <>
      <div className="json-form-section">
        <div className="json-form-section-title">Story Configuration</div>

        <div className="json-form-row">
          <div className="json-form-field">
            <label className="json-form-label json-form-label-required">Story ID</label>
            <input
              type="text"
              className="json-form-input"
              value={data.storyId}
              onChange={(e) => onChange('storyId', e.target.value)}
              placeholder="sarah-chat-1"
            />
            <div className="json-form-hint">Unique identifier for this conversation</div>
          </div>
          <div className="json-form-field">
            <label className="json-form-label json-form-label-required">Contact ID</label>
            <input
              type="text"
              className="json-form-input"
              value={data.contactID}
              onChange={(e) => onChange('contactID', e.target.value)}
              placeholder="sarah"
            />
            <div className="json-form-hint">Which character this conversation is with</div>
          </div>
        </div>

        <div className="json-form-field">
          <label className="json-form-label">Next Story ID</label>
          <input
            type="text"
            className="json-form-input"
            value={data.nextStoryId || ''}
            onChange={(e) => onChange('nextStoryId', e.target.value)}
            placeholder="sarah-chat-2"
          />
          <div className="json-form-hint">ID of the next conversation in sequence</div>
        </div>

        <div className="json-form-row">
          <div className="json-form-field">
            <div className="json-form-checkbox-wrapper">
              <input
                type="checkbox"
                className="json-form-checkbox"
                checked={data.isStartingStory || false}
                onChange={(e) => onChange('isStartingStory', e.target.checked)}
                id="isStartingStory"
              />
              <label htmlFor="isStartingStory" className="json-form-checkbox-label">
                Is Starting Story
              </label>
            </div>
            <div className="json-form-hint">Is this the first conversation in your mod?</div>
          </div>
          <div className="json-form-field">
            <div className="json-form-checkbox-wrapper">
              <input
                type="checkbox"
                className="json-form-checkbox"
                checked={data.isSideStory || false}
                onChange={(e) => onChange('isSideStory', e.target.checked)}
                id="isSideStory"
              />
              <label htmlFor="isSideStory" className="json-form-checkbox-label">
                Is Side Story
              </label>
            </div>
            <div className="json-form-hint">Can be triggered as a side story</div>
          </div>
        </div>
      </div>

      <div className="json-form-section">
        <div className="json-form-section-title">Timing</div>

        <div className="json-form-row">
          <div className="json-form-field">
            <label className="json-form-label">Time (24-hour)</label>
            <input
              type="number"
              className="json-form-input json-form-number"
              value={data.forceTimeInHours ?? 12}
              onChange={(e) => onChange('forceTimeInHours', parseInt(e.target.value) || 0)}
              min={0}
              max={23}
            />
            <div className="json-form-hint">What time this conversation happens</div>
          </div>
          <div className="json-form-field">
            <label className="json-form-label">Additional Minutes</label>
            <input
              type="number"
              className="json-form-input json-form-number"
              value={data.passTimeInMinutes ?? 0}
              onChange={(e) => onChange('passTimeInMinutes', parseInt(e.target.value) || 0)}
              min={0}
              max={59}
            />
          </div>
        </div>

        <div className="json-form-row">
          <div className="json-form-field">
            <div className="json-form-checkbox-wrapper">
              <input
                type="checkbox"
                className="json-form-checkbox"
                checked={data.timeIsExact || false}
                onChange={(e) => onChange('timeIsExact', e.target.checked)}
                id="timeIsExact"
              />
              <label htmlFor="timeIsExact" className="json-form-checkbox-label">
                Time Is Exact
              </label>
            </div>
            <div className="json-form-hint">Go to exact time vs. relative time</div>
          </div>
          <div className="json-form-field">
            <label className="json-form-label">Force Day</label>
            <select
              className="json-form-input json-form-select"
              value={data.forceDay ?? 0}
              onChange={(e) => onChange('forceDay', parseInt(e.target.value))}
            >
              {DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  );
}

// Injection form component
function InjectionForm({
  data,
  onChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
}: {
  data: InjectionJson;
  onChange: <K extends keyof InjectionJson>(field: K, value: InjectionJson[K]) => void;
  onItemChange: (index: number, field: keyof InjectionConversation, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
}) {
  return (
    <>
      <div className="json-form-section">
        <div className="json-form-section-title">Injection Configuration</div>

        <div className="json-form-field">
          <label className="json-form-label json-form-label-required">Injection ID</label>
          <input
            type="text"
            className="json-form-input"
            value={data.injectionId}
            onChange={(e) => onChange('injectionId', e.target.value)}
            placeholder="secret-reveal"
          />
          <div className="json-form-hint">Unique ID used to trigger this injection</div>
        </div>
      </div>

      <div className="json-form-section">
        <div className="json-form-section-title">Conversations to Receive</div>

        <div className="json-form-array">
          <div className="json-form-array-header">
            <span className="json-form-array-title">
              {data.conversationsToReceive.length} conversation(s)
            </span>
            <button className="json-form-array-add" onClick={onAddItem}>
              + Add Conversation
            </button>
          </div>
          <div className="json-form-array-items">
            {data.conversationsToReceive.length === 0 ? (
              <div className="json-form-array-empty">
                No conversations configured. Click "Add Conversation" to add one.
              </div>
            ) : (
              data.conversationsToReceive.map((conv, index) => (
                <div key={index} className="json-form-array-item">
                  <div className="json-form-array-item-content">
                    <div className="json-form-row">
                      <div className="json-form-field">
                        <label className="json-form-label">Contact ID (Receiver)</label>
                        <input
                          type="text"
                          className="json-form-input"
                          value={conv.contactId}
                          onChange={(e) => onItemChange(index, 'contactId', e.target.value)}
                          placeholder="sarah"
                        />
                      </div>
                      <div className="json-form-field">
                        <label className="json-form-label">Sender ID</label>
                        <input
                          type="text"
                          className="json-form-input"
                          value={conv.senderId}
                          onChange={(e) => onItemChange(index, 'senderId', e.target.value)}
                          placeholder="ben"
                        />
                      </div>
                    </div>
                    <div className="json-form-field" style={{ marginBottom: 0 }}>
                      <label className="json-form-label">Ink File Path</label>
                      <input
                        type="text"
                        className="json-form-input"
                        value={conv.inkFilePath}
                        onChange={(e) => onItemChange(index, 'inkFilePath', e.target.value)}
                        placeholder="secret-reveal.ink"
                      />
                    </div>
                  </div>
                  <button
                    className="json-form-array-item-remove"
                    onClick={() => onRemoveItem(index)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default ConversationJsonEditor;
