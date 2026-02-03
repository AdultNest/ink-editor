/**
 * PromptLibraryEditor component
 *
 * Editor for .prompt-library.json files.
 * Provides a tabbed interface for managing reusable prompt components.
 * Supports AI-powered prompt generation when Ollama is enabled.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type ProjectPromptLibrary,
  type PromptComponent,
  PromptComponentCategory,
  CATEGORY_INFO,
  getCategoryInfo,
  promptLibraryService,
  getDefaultLibrary,
} from '../../services';
import type { AppSettings } from '../../../preload';
import './PromptLibraryEditor.css';

/** System prompt for generating prompt components */
const AI_SYSTEM_PROMPT = `You are an expert at creating Stable Diffusion image generation prompts.
Your task is to generate prompt components (tags) for a specific category.

IMPORTANT RULES:
1. Generate ONLY comma-separated tags suitable for Stable Diffusion
2. Keep tags concise and specific
3. For positive prompts: include descriptive tags that help generate the desired result
4. For negative prompts: include tags to avoid unwanted elements (opposite of positive)
5. Do NOT include quality tags like "masterpiece" or "best quality" - those are added separately
6. Focus on the specific subject/concept, not general quality

Respond in JSON format:
{
  "name": "Short descriptive name (2-3 words)",
  "positive": "comma, separated, positive, tags",
  "negative": "comma, separated, negative, tags"
}`;

/** System prompt for generating MOOD components */
const AI_MOOD_SYSTEM_PROMPT = `You are an expert at creating character personality descriptions for AI text generation.
Your task is to generate a mood/personality profile that can be used to guide how a character speaks and behaves.

IMPORTANT RULES:
1. Focus on personality traits, speech patterns, and behavioral tendencies
2. Be specific about tone, word choices, and typical responses
3. Include both positive and negative traits for realism
4. The description should help an AI generate dialogue in this character's voice
5. For positive/negative prompts: include visual descriptors for facial expressions and body language

Respond in JSON format:
{
  "name": "Short mood name (1-2 words)",
  "positive": "visual descriptors for images (e.g., smiling, relaxed pose)",
  "negative": "visual descriptors to avoid (e.g., angry, tense)",
  "description": "Detailed personality description for text generation (2-4 sentences)"
}`;

export interface PromptLibraryEditorProps {
  filePath: string;
  fileName: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function PromptLibraryEditor({ filePath, fileName, onDirtyChange }: PromptLibraryEditorProps) {
  const [library, setLibrary] = useState<ProjectPromptLibrary>(getDefaultLibrary());
  const [originalLibrary, setOriginalLibrary] = useState<ProjectPromptLibrary>(getDefaultLibrary());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PromptComponentCategory>(PromptComponentCategory.LOCATION);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // AI generation state
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCategory, setAiCategory] = useState<PromptComponentCategory>(PromptComponentCategory.LOCATION);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const isOllamaEnabled = appSettings?.ollama?.enabled && appSettings?.ollama?.model;

  const isDirty = JSON.stringify(library) !== JSON.stringify(originalLibrary);

  // Notify parent of dirty state changes
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const prevDirtyRef = useRef(isDirty);
  useEffect(() => {
    if (prevDirtyRef.current !== isDirty) {
      prevDirtyRef.current = isDirty;
      onDirtyChangeRef.current?.(isDirty);
    }
  }, [isDirty]);

  // Load app settings to check if Ollama is enabled
  useEffect(() => {
    window.electronAPI.getSettings().then(setAppSettings).catch(console.error);
  }, []);

  // Load file
  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const content = await window.electronAPI.readFile(filePath);
        const parsed = JSON.parse(content) as ProjectPromptLibrary;

        if (isMounted) {
          // Ensure the library has valid structure
          const validLibrary: ProjectPromptLibrary = {
            version: parsed?.version ?? 1,
            components: Array.isArray(parsed?.components) ? parsed.components : [],
          };
          setLibrary(validLibrary);
          setOriginalLibrary(validLibrary);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          // File might not exist or be empty, start with defaults
          const defaultLibrary = getDefaultLibrary();
          setLibrary(defaultLibrary);
          setOriginalLibrary(defaultLibrary);
          setIsLoading(false);
        }
      }
    }

    loadFile();
    return () => { isMounted = false; };
  }, [filePath]);

  // Save file
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const content = JSON.stringify(library, null, 2);
      await window.electronAPI.writeFile(filePath, content);
      setOriginalLibrary(library);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, library]);

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

  // Component handlers
  const addComponent = useCallback(() => {
    const newComponent: PromptComponent = {
      id: `${activeCategory}_${Date.now().toString(36)}`,
      name: 'New Component',
      category: activeCategory,
      positive: '',
      negative: '',
    };
    setLibrary(prev => ({
      ...prev,
      components: [...prev.components, newComponent],
    }));
    setEditingComponentId(newComponent.id);
  }, [activeCategory]);

  const updateComponent = useCallback((id: string, updates: Partial<PromptComponent>) => {
    setLibrary(prev => ({
      ...prev,
      components: prev.components.map(c =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const deleteComponent = useCallback((id: string) => {
    setLibrary(prev => ({
      ...prev,
      components: prev.components.filter(c => c.id !== id),
    }));
    setEditingComponentId(null);
  }, []);

  const resetToDefaults = useCallback(() => {
    if (window.confirm('Reset library to defaults? This will remove all custom components.')) {
      setLibrary(getDefaultLibrary());
    }
  }, []);

  // Open AI generation dialog
  const openAiDialog = useCallback(() => {
    setAiCategory(activeCategory);
    setAiPrompt('');
    setAiError(null);
    setShowAiDialog(true);
  }, [activeCategory]);

  // Generate prompt component with AI
  const generateWithAi = useCallback(async () => {
    if (!appSettings?.ollama || !aiPrompt.trim()) return;

    setIsGenerating(true);
    setAiError(null);

    try {
      const categoryInfo = getCategoryInfo(aiCategory);
      const isMoodCategory = aiCategory === PromptComponentCategory.MOOD;

      const userPrompt = isMoodCategory
        ? `Generate a mood/personality profile for: ${aiPrompt}

Create a personality that can guide how a character speaks and behaves.`
        : `Generate a prompt component for the "${categoryInfo?.label || aiCategory}" category.

The user wants: ${aiPrompt}

Remember to generate tags suitable for Stable Diffusion image generation.`;

      const result = await window.electronAPI.generateWithOllama({
        baseUrl: appSettings.ollama.baseUrl,
        model: appSettings.ollama.model,
        prompt: userPrompt,
        systemPrompt: isMoodCategory ? AI_MOOD_SYSTEM_PROMPT : AI_SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 512,
        format: 'json',
      });

      if (!result.success || !result.response) {
        throw new Error(result.error || 'Failed to generate with AI');
      }

      // Parse the response
      let generated: { name?: string; positive?: string; negative?: string; description?: string };
      const responseText = result.response;
      try {
        generated = JSON.parse(responseText);
      } catch {
        // Try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          generated = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Invalid response format from AI');
        }
      }

      if (!generated.name || !generated.positive) {
        throw new Error('AI response missing required fields');
      }

      // Create and add the new component
      const newComponent: PromptComponent = {
        id: `${aiCategory}_ai_${Date.now().toString(36)}`,
        name: generated.name,
        category: aiCategory,
        positive: generated.positive,
        negative: generated.negative || '',
        description: isMoodCategory ? generated.description : undefined,
      };

      setLibrary(prev => ({
        ...prev,
        components: [...(prev.components || []), newComponent],
      }));

      // Close dialog and open the new component for editing
      setShowAiDialog(false);
      setActiveCategory(aiCategory);
      setEditingComponentId(newComponent.id);
      setSearchQuery('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [appSettings, aiPrompt, aiCategory]);

  // Get filtered components (with safety check)
  const filteredComponents = library?.components
    ? (searchQuery
        ? promptLibraryService.searchComponents(library, searchQuery)
        : promptLibraryService.getComponentsByCategory(library, activeCategory))
    : [];

  if (isLoading) {
    return (
      <div className="content-view content-view-loading">
        <div className="content-view-spinner" />
        <span>Loading {fileName}...</span>
      </div>
    );
  }

  return (
    <div className="content-view prompt-library-editor">
      {/* Header */}
      <div className="prompt-library__header">
        <div className="prompt-library__title">
          <span className="prompt-library__icon">📚</span>
          <div className="prompt-library__title-text">
            <h2>Prompt Library</h2>
            <span className="prompt-library__subtitle">Reusable prompt components for image generation</span>
          </div>
        </div>
        <div className="prompt-library__actions">
          {isDirty && <span className="prompt-library__dirty">Modified</span>}
          <button
            className="prompt-library__reset-btn"
            onClick={resetToDefaults}
            title="Reset to defaults"
          >
            Reset
          </button>
          <button
            className="prompt-library__save-btn"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="prompt-library__error">{error}</div>
      )}

      {/* Search */}
      <div className="prompt-library__search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search components..."
          className="prompt-library__search-input"
        />
        {searchQuery && (
          <button
            className="prompt-library__search-clear"
            onClick={() => setSearchQuery('')}
          >
            &times;
          </button>
        )}
      </div>

      {/* Category Tabs */}
      {!searchQuery && (
        <div className="prompt-library__tabs">
          {CATEGORY_INFO.map(info => (
            <button
              key={info.category}
              className={`prompt-library__tab ${activeCategory === info.category ? 'active' : ''}`}
              onClick={() => setActiveCategory(info.category)}
            >
              <span className="prompt-library__tab-icon">{info.icon}</span>
              {info.label}
              <span className="prompt-library__tab-count">
                {promptLibraryService.getComponentsByCategory(library, info.category).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="prompt-library__content">
        <div className="prompt-library__section">
          <div className="prompt-library__section-header">
            <div className="prompt-library__section-info">
              {searchQuery ? (
                <>
                  <h3>Search Results</h3>
                  <p>Found {filteredComponents.length} components matching "{searchQuery}"</p>
                </>
              ) : (
                <>
                  <h3>{CATEGORY_INFO.find(c => c.category === activeCategory)?.label}</h3>
                  <p>{CATEGORY_INFO.find(c => c.category === activeCategory)?.description}</p>
                </>
              )}
            </div>
            {!searchQuery && (
              <div className="prompt-library__section-actions">
                {isOllamaEnabled && (
                  <button className="prompt-library__ai-btn" onClick={openAiDialog}>
                    Generate with AI
                  </button>
                )}
                <button className="prompt-library__add-btn" onClick={addComponent}>
                  + Add Component
                </button>
              </div>
            )}
          </div>

          {filteredComponents.length === 0 ? (
            <div className="prompt-library__empty">
              <span className="prompt-library__empty-icon">📭</span>
              <p>No components found.</p>
              {!searchQuery && (
                <button className="prompt-library__add-btn" onClick={addComponent}>
                  Add First Component
                </button>
              )}
            </div>
          ) : (
            <div className="prompt-library__list">
              {filteredComponents.map(component => (
                <div
                  key={component.id}
                  className={`prompt-library__item ${editingComponentId === component.id ? 'expanded' : ''}`}
                >
                  <div
                    className="prompt-library__item-header"
                    onClick={() => setEditingComponentId(editingComponentId === component.id ? null : component.id)}
                  >
                    <div className="prompt-library__item-info">
                      <span className="prompt-library__item-name">{component.name}</span>
                      {searchQuery && (
                        <span className="prompt-library__item-category">
                          {CATEGORY_INFO.find(c => c.category === component.category)?.label}
                        </span>
                      )}
                    </div>
                    <div className="prompt-library__item-actions">
                      <button
                        className="prompt-library__delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteComponent(component.id);
                        }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                      <span className="prompt-library__expand-icon">
                        {editingComponentId === component.id ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>

                  {editingComponentId === component.id && (
                    <div className="prompt-library__item-content">
                      <div className="prompt-library__field">
                        <label>Name</label>
                        <input
                          type="text"
                          value={component.name}
                          onChange={(e) => updateComponent(component.id, { name: e.target.value })}
                          placeholder="Component name"
                        />
                      </div>

                      {/* Show description field for MOOD category */}
                      {component.category === PromptComponentCategory.MOOD && (
                        <div className="prompt-library__field">
                          <label>Personality Description</label>
                          <textarea
                            value={component.description || ''}
                            onChange={(e) => updateComponent(component.id, { description: e.target.value })}
                            placeholder="Describe how this character behaves and speaks when in this mood..."
                            rows={4}
                          />
                          <p className="prompt-library__field-hint">
                            This text is injected into the AI system prompt for text generation.
                          </p>
                        </div>
                      )}

                      <div className="prompt-library__field">
                        <label>{component.category === PromptComponentCategory.MOOD ? 'Visual Positive Tags' : 'Positive Prompt'}</label>
                        <textarea
                          value={component.positive}
                          onChange={(e) => updateComponent(component.id, { positive: e.target.value })}
                          placeholder={component.category === PromptComponentCategory.MOOD
                            ? "Visual tags for images (e.g., smiling, relaxed)"
                            : "Tags to include in the prompt..."}
                          rows={3}
                        />
                      </div>

                      <div className="prompt-library__field">
                        <label>{component.category === PromptComponentCategory.MOOD ? 'Visual Negative Tags (Optional)' : 'Negative Prompt (Optional)'}</label>
                        <textarea
                          value={component.negative || ''}
                          onChange={(e) => updateComponent(component.id, { negative: e.target.value })}
                          placeholder={component.category === PromptComponentCategory.MOOD
                            ? "Visual tags to avoid (e.g., angry, frowning)"
                            : "Tags to exclude..."}
                          rows={2}
                        />
                      </div>

                      {searchQuery && (
                        <div className="prompt-library__field">
                          <label>Category</label>
                          <select
                            value={component.category}
                            onChange={(e) => updateComponent(component.id, { category: e.target.value as PromptComponentCategory })}
                          >
                            {CATEGORY_INFO.map(info => (
                              <option key={info.category} value={info.category}>
                                {info.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Generation Dialog */}
      {showAiDialog && (
        <div className="prompt-library__dialog-backdrop" onClick={() => !isGenerating && setShowAiDialog(false)}>
          <div className="prompt-library__dialog" onClick={e => e.stopPropagation()}>
            <div className="prompt-library__dialog-header">
              <h3>Generate with AI</h3>
              <button
                className="prompt-library__dialog-close"
                onClick={() => setShowAiDialog(false)}
                disabled={isGenerating}
              >
                &times;
              </button>
            </div>

            <div className="prompt-library__dialog-content">
              <div className="prompt-library__field">
                <label>Category</label>
                <select
                  value={aiCategory}
                  onChange={(e) => setAiCategory(e.target.value as PromptComponentCategory)}
                  disabled={isGenerating}
                >
                  {CATEGORY_INFO.map(info => (
                    <option key={info.category} value={info.category}>
                      {info.icon} {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="prompt-library__field">
                <label>Describe what you want to generate</label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={`e.g., "A cozy winter cabin in the mountains" or "Elegant evening gown with sparkles"`}
                  rows={3}
                  disabled={isGenerating}
                  autoFocus
                />
                <p className="prompt-library__field-hint">
                  Be specific about the scene, style, or concept you want to create prompts for.
                </p>
              </div>

              {aiError && (
                <div className="prompt-library__dialog-error">{aiError}</div>
              )}
            </div>

            <div className="prompt-library__dialog-footer">
              <button
                className="prompt-library__dialog-cancel"
                onClick={() => setShowAiDialog(false)}
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                className="prompt-library__dialog-generate"
                onClick={generateWithAi}
                disabled={isGenerating || !aiPrompt.trim()}
              >
                {isGenerating ? (
                  <>
                    <span className="prompt-library__spinner-small" />
                    Generating...
                  </>
                ) : (
                  'Generate'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PromptLibraryEditor;
