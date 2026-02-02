/**
 * CharacterJsonEditor component
 *
 * Special form-based editor for character JSON files (in "characters" folder).
 * Includes AI-powered generation for names, profile pictures, and character details.
 */

import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import type {AppSettings} from '../../../preload';
import {promptBuilder, type CharacterConfig} from '../../services/promptBuilder';
import {ImagePreviewGenerator} from '../ImagePreviewGenerator';
import './JsonEditor.css';
import './CharacterJsonEditor.css';

export interface CharacterJsonEditorProps {
    filePath: string;
    fileName: string;
    appSettings?: AppSettings;
    onDirtyChange?: (isDirty: boolean) => void;
}

interface CharacterJson {
    isMainCharacter: boolean;
    contactID: string;
    contactName: string;
    contactNickname: string;
    contactNicknameShort: string;
    contactLastName?: string;
    profilePicturePath: string;
    characterColorHex?: string;
    contactDescription?: string;
    contactPersonality?: string;
    contactHistory?: string;
    showContactFromStart?: boolean;
}

const DEFAULT_CHARACTER: CharacterJson = {
    isMainCharacter: false,
    contactID: '',
    contactName: '',
    contactNickname: '',
    contactNicknameShort: '',
    profilePicturePath: '',
};

/**
 * Clean up LLM response text by removing common artifacts
 */
function cleanLLMResponse(text: string): string {
    let cleaned = text.trim();

    // Remove markdown code blocks
    cleaned = cleaned.replace(/^```(?:json|text|markdown)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');

    // Remove surrounding quotes
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1);
    }

    // Try to extract text from JSON if it looks like a JSON object
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        try {
            const parsed = JSON.parse(cleaned);
            const keys = Object.keys(parsed);

            // Case 1: Object with text as value - {"field": "the actual text"}
            const textFields = ['text', 'content', 'response', 'result', 'personality', 'description', 'history', 'output', 'modelResponse'];
            for (const field of textFields) {
                if (typeof parsed[field] === 'string') {
                    return cleanLLMResponse(parsed[field]); // Recursively clean
                }
            }

            // Case 2: Malformed object where text is the key - {"the actual text": "modelResponse"}
            // If there's only one key and it's a long string, that's probably the content
            if (keys.length === 1 && keys[0].length > 20) {
                return cleanLLMResponse(keys[0]); // Recursively clean
            }

            // Case 3: Check all values for long strings
            for (const key of keys) {
                if (typeof parsed[key] === 'string' && parsed[key].length > 20) {
                    return cleanLLMResponse(parsed[key]);
                }
            }
        } catch {
            // Not valid JSON, continue with original
        }
    }

    // Remove common prefixes LLMs add
    cleaned = cleaned.replace(/^(Here'?s?|Output|Result|Response|Generated):\s*/i, '');

    // Unescape common escaped characters
    cleaned = cleaned.replace(/\\n/g, '\n');
    cleaned = cleaned.replace(/\\"/g, '"');

    return cleaned.trim();
}

// Personality presets for AI generation
const PERSONALITY_PRESETS = [
    {
        label: 'Lighthearted',
        prompt: 'lighthearted and cheerful, always looks on the bright side, quick to laugh and make jokes'
    },
    {label: 'Naive', prompt: 'innocent and naive, trusts easily, often misses social cues, genuinely kind-hearted'},
    {label: 'Mysterious', prompt: 'enigmatic and secretive, speaks in riddles, reveals little about themselves'},
    {label: 'Confident', prompt: 'self-assured and bold, takes charge in conversations, charismatic'},
    {label: 'Shy', prompt: 'introverted and reserved, hesitant to open up, but warm once comfortable'},
    {label: 'Sarcastic', prompt: 'witty and sarcastic, uses dry humor, secretly caring beneath the snark'},
    {label: 'Caring', prompt: 'nurturing and supportive, always puts others first, great listener'},
    {label: 'Ambitious', prompt: 'driven and goal-oriented, competitive, focused on success'},
    {label: 'Insecure', prompt: 'insecure about their body and appearance, seeks validation, sensitive to criticism but tries to hide it'},
    {label: 'Flirty', prompt: 'playfully flirtatious, loves to tease, enjoys the thrill of attraction, confident but not pushy'},
    {label: 'Dominant', prompt: 'naturally dominant and assertive, likes to be in control, decisive, expects others to follow their lead'},
    {label: 'Submissive', prompt: 'submissive and eager to please, defers to others, finds comfort in following rather than leading'},
    {label: 'Playful', prompt: 'mischievous and playful, loves pranks and games, never takes things too seriously, infectious energy'},
    {label: 'Moody', prompt: 'emotionally volatile, mood swings between highs and lows, unpredictable but passionate'},
    {label: 'Jealous', prompt: 'possessive and easily jealous, needs constant reassurance, struggles with trust but deeply loyal'},
    {label: 'Protective', prompt: 'fiercely protective of loved ones, takes charge in dangerous situations, sometimes overprotective'},
    {label: 'Anxious', prompt: 'anxious and overthinks everything, worries about what others think, needs reassurance but very loyal'},
    {label: 'Rebellious', prompt: 'rebellious and defiant, questions authority, does things their own way, secretly wants acceptance'},
];

// Description presets for AI generation
const DESCRIPTION_PRESETS = [
    {label: 'Sibling', prompt: 'my sibling, we grew up together and have that typical sibling relationship'},
    {label: 'Best Friend', prompt: 'my best friend, we share everything and know each other inside out'},
    {label: 'Coworker', prompt: 'a coworker I see every day, we have a professional but friendly relationship'},
    {label: 'Neighbor', prompt: 'my neighbor, we chat occasionally and help each other out'},
    {label: 'Old Friend', prompt: 'an old friend from school/college, we reconnected recently'},
    {label: 'Crush', prompt: 'someone I have a crush on, I get nervous around them'},
    {label: 'Mentor', prompt: 'someone who mentors and guides me, I look up to them'},
    {label: 'Rival', prompt: 'a friendly rival, we compete but respect each other'},
    {label: 'Girlfriend', prompt: 'my girlfriend, we are in a romantic relationship and deeply care for each other'},
    {label: 'Boyfriend', prompt: 'my boyfriend, we are in a romantic relationship and deeply care for each other'},
    {label: 'Wife', prompt: 'my wife, we are married and share our lives together'},
    {label: 'Husband', prompt: 'my husband, we are married and share our lives together'},
    {label: 'Ex', prompt: 'my ex, we used to date but broke up, things are complicated between us'},
    {label: 'Roommate', prompt: 'my roommate, we live together and share the apartment, sometimes boundaries blur'},
    {label: 'FWB', prompt: 'friends with benefits, we hook up casually but try to keep emotions out of it'},
    {label: 'Secret Lover', prompt: 'my secret lover, nobody knows about our relationship, we meet in secret'},
    {label: 'Fiancé(e)', prompt: 'my fiancé(e), we are engaged and planning our future together'},
    {label: 'Stranger', prompt: 'a stranger I just met, there is something intriguing about them'},
];

// History presets for AI generation
const HISTORY_PRESETS = [
    {label: 'Childhood', prompt: 'we have known each other since childhood, grew up together'},
    {label: 'School', prompt: 'we met in school/college and became close through shared classes or activities'},
    {label: 'Work', prompt: 'we met through work or a professional setting'},
    {label: 'Online', prompt: 'we met online through gaming, social media, or a dating app'},
    {label: 'Accident', prompt: 'we met by accident or coincidence in an unexpected situation'},
    {label: 'Trauma Bond', prompt: 'we bonded through a difficult or traumatic shared experience'},
    {label: 'Family Friend', prompt: 'our families know each other, we were introduced through relatives'},
    {label: 'Recent', prompt: 'we just met recently and are still getting to know each other'},
    {label: 'Dating', prompt: 'we started dating a few months ago after meeting through mutual friends'},
    {label: 'Married', prompt: 'we got married after dating for a while, we have been together for years now'},
    {label: 'Engaged', prompt: 'we recently got engaged after a romantic proposal, planning our wedding'},
    {label: 'Broke Up', prompt: 'we used to be together but broke up, now trying to figure out where we stand'},
    {label: 'Long Distance', prompt: 'we have been in a long distance relationship, rarely see each other in person'},
    {label: 'Rekindled', prompt: 'we used to date years ago, recently reconnected and old feelings resurfaced'},
    {label: 'Arranged', prompt: 'our relationship was arranged by our families, we are learning to know each other'},
    {label: 'Secret', prompt: 'we have been seeing each other in secret, hiding our relationship from others'},
    {label: 'Complicated', prompt: 'our history is complicated, on and off relationship with lots of drama'},
    {label: 'One Night', prompt: 'we had a one night stand and now things are awkward between us'},
];

export function CharacterJsonEditor({filePath, fileName, appSettings, onDirtyChange}: CharacterJsonEditorProps) {
    const [data, setData] = useState<CharacterJson>(DEFAULT_CHARACTER);
    const [originalData, setOriginalData] = useState<CharacterJson>(DEFAULT_CHARACTER);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // AI generation states
    const [isGeneratingName, setIsGeneratingName] = useState(false);
    const [isGeneratingPersonality, setIsGeneratingPersonality] = useState(false);
    const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
    const [isGeneratingHistory, setIsGeneratingHistory] = useState(false);

    // Image gallery state
    const [availableImages, setAvailableImages] = useState<string[]>([]);
    const [showGallery, setShowGallery] = useState(false);
    const [imageFilter, setImageFilter] = useState('');

    // Character config (appearance data from .conf file)
    const [characterConfig, setCharacterConfig] = useState<CharacterConfig | null>(null);

    // Project path (derived from file path)
    const projectPath = useMemo(() => {
        // Walk up from Characters folder to find project root
        const normalized = filePath.replace(/\\/g, '/');
        const charactersIndex = normalized.toLowerCase().indexOf('/characters/');
        if (charactersIndex !== -1) {
            return normalized.substring(0, charactersIndex);
        }
        // Fallback: go up two directories
        const parts = normalized.split('/');
        return parts.slice(0, -2).join('/');
    }, [filePath]);

    const isDirty = JSON.stringify(data) !== JSON.stringify(originalData);
    const ollamaEnabled = appSettings?.ollama?.enabled && appSettings.ollama.baseUrl && appSettings.ollama.model;
    const comfyEnabled = appSettings?.comfyui?.enabled && appSettings.comfyui.baseUrl;

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

    // Load file
    useEffect(() => {
        let isMounted = true;

        async function loadFile() {
            setIsLoading(true);
            setError(null);

            try {
                const content = await window.electronAPI.readFile(filePath);
                const parsed = JSON.parse(content);
                const charData = {...DEFAULT_CHARACTER, ...parsed};
                if (isMounted) {
                    setData(charData);
                    setOriginalData(charData);
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
        return () => {
            isMounted = false;
        };
    }, [filePath]);

    // Load character config (.conf file with appearance data)
    useEffect(() => {
        let isMounted = true;

        async function loadConfig() {
            try {
                // Derive .conf path from .json path (same name, different extension)
                const confPath = filePath.replace(/\.json$/i, '.conf');
                const exists = await window.electronAPI.fileExists(confPath);
                if (!exists) {
                    if (isMounted) setCharacterConfig(null);
                    return;
                }

                const content = await window.electronAPI.readFile(confPath);
                const parsed = JSON.parse(content) as CharacterConfig;
                if (isMounted) {
                    setCharacterConfig(parsed);
                }
            } catch {
                if (isMounted) setCharacterConfig(null);
            }
        }

        loadConfig();
        return () => {
            isMounted = false;
        };
    }, [filePath]);

    // Load available images
    useEffect(() => {
        async function loadImages() {
            try {
                const imagesPath = `${projectPath}/Images`;
                const exists = await window.electronAPI.fileExists(imagesPath);
                if (!exists) {
                    setAvailableImages([]);
                    return;
                }
                const entries = await window.electronAPI.readDir(imagesPath);
                const images = entries
                    .filter(e => !e.isDirectory && /\.(png|jpg|jpeg|webp|gif)$/i.test(e.name))
                    .map(e => e.name);
                setAvailableImages(images);
            } catch {
                setAvailableImages([]);
            }
        }

        if (projectPath) {
            loadImages();
        }
    }, [projectPath]);

    const handleChange = useCallback(<K extends keyof CharacterJson>(field: K, value: CharacterJson[K]) => {
        setData(prev => ({...prev, [field]: value}));
    }, []);

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

    // Generate random name with Ollama
    const generateName = useCallback(async (gender: 'male' | 'female') => {
        if (!ollamaEnabled || !appSettings?.ollama) return;

        setIsGeneratingName(true);
        try {
            const prompt = `Generate a realistic ${gender} character name. Return ONLY a JSON object with these exact keys, no explanation:
{"fullName": "First Last", "lastName": "Last", "nickname": "Nick", "shortName": "N"}

Example for male: {"fullName": "James Mitchell", "lastName": "Mitchell", "nickname": "Jamie", "shortName": "J"}
Example for female: {"fullName": "Sarah Chen", "lastName": "Chen", "nickname": "Sarah", "shortName": "S"}

Generate a unique, creative name now:`;

            const result = await window.electronAPI.generateWithOllama({
                baseUrl: appSettings.ollama.baseUrl,
                model: appSettings.ollama.model,
                prompt,
                temperature: 0.9,
                format: 'json',
            });

            if (result.success && result.response) {
                // Extract JSON from response
                const jsonMatch = result.response.match(/\{[\s\S]*?}/);
                if (jsonMatch) {
                    const nameData = JSON.parse(jsonMatch[0]);
                    setData(prev => ({
                        ...prev,
                        contactName: nameData.fullName || prev.contactName,
                        contactLastName: nameData.lastName || prev.contactLastName,
                        contactNickname: nameData.nickname || prev.contactNickname,
                        contactNicknameShort: nameData.shortName || prev.contactNicknameShort,
                    }));
                }
            }
        } catch (err) {
            console.error('Failed to generate name:', err);
        } finally {
            setIsGeneratingName(false);
        }
    }, [ollamaEnabled, appSettings?.ollama]);

    // Generate personality with Ollama
    const generatePersonality = useCallback(async (preset?: string) => {
        if (!ollamaEnabled || !appSettings?.ollama) return;

        setIsGeneratingPersonality(true);
        try {
            const basePrompt = preset
                ? `Write a personality description for a character who is ${preset}.`
                : 'Write a unique and interesting personality description for a fictional character.';

            const prompt = `${basePrompt}

Write from a narrative perspective.
Keep it casual and conversational, 2-3 sentences max.
Include specific quirks or habits that make them memorable.
Do NOT insert anything related to this conversation and only output the text.
Don NOT use the character's name.

Example: "Always has to be the center of attention but in a charming way. Gets weirdly competitive about board games and will sulk if they lose. Somehow knows everyone's coffee order."

Generate now:
`;

            const result = await window.electronAPI.generateWithOllama({
                baseUrl: appSettings.ollama.baseUrl,
                model: appSettings.ollama.model,
                prompt,
                temperature: 0.8,
            });

            if (result.success && result.response) {
                const personality = cleanLLMResponse(result.response);
                setData(prev => ({...prev, contactPersonality: personality}));
            }
        } catch (err) {
            console.error('Failed to generate personality:', err);
        } finally {
            setIsGeneratingPersonality(false);
        }
    }, [ollamaEnabled, appSettings?.ollama]);

    // Generate description with Ollama
    const generateDescription = useCallback(async (preset?: string) => {
        if (!ollamaEnabled || !appSettings?.ollama) return;

        setIsGeneratingDescription(true);
        try {
            const context = data.contactName ? `The character's name is ${data.contactName}.` : '';
            const personalityContext = data.contactPersonality ? `Their personality: ${data.contactPersonality}` : '';

            const basePrompt = preset
                ? `Write a brief character description for someone who is ${preset}.`
                : 'Write a brief character description from a first-person perspective (as if describing someone you know).';

            const prompt = `${basePrompt}
${context}
${personalityContext}

Write from a first-person perspective of the "self".
Keep it casual, 2-3 sentences. Focus on who they are and your relationship with them.
Do NOT insert anything related to this conversation and only output the text.
Example: "My older sister, always trying to give unsolicited advice. She works at some tech startup and won't shut up about her latest project. Annoying but I love her."

Generate now:
`;

            const result = await window.electronAPI.generateWithOllama({
                baseUrl: appSettings.ollama.baseUrl,
                model: appSettings.ollama.model,
                prompt,
                temperature: 0.8,
            });

            if (result.success && result.response) {
                const description = cleanLLMResponse(result.response);
                setData(prev => ({...prev, contactDescription: description}));
            }
        } catch (err) {
            console.error('Failed to generate description:', err);
        } finally {
            setIsGeneratingDescription(false);
        }
    }, [ollamaEnabled, appSettings?.ollama, data.contactName, data.contactPersonality]);

    // Generate history with Ollama
    const generateHistory = useCallback(async (preset?: string) => {
        if (!ollamaEnabled || !appSettings?.ollama) return;

        setIsGeneratingHistory(true);
        try {
            const context = data.contactName ? `The character's name is ${data.contactName}.` : '';
            const personalityContext = data.contactPersonality ? `Their personality: ${data.contactPersonality}` : '';
            const descContext = data.contactDescription ? `Description: ${data.contactDescription}` : '';

            const basePrompt = preset
                ? `Write a brief backstory/history from a first-person perspective about how ${preset}.`
                : 'Write a brief backstory/history from a first-person perspective (describing how you know this person).';

            const prompt = `${basePrompt}
${context}
${personalityContext}
${descContext}

Keep it casual, 2-3 sentences.
Mention how you met or how long you've known them.
Mention some specific highlights or problems in your relationship if adequate.
Write from a first-person perspective of someone describing this person (friend, acquaintance).
Do NOT insert anything related to this conversation and only output the text.
Example: "We met at a coffee shop when she accidentally grabbed my drink. She was so embarrassed she bought me three more coffees. We've been friends ever since, that was like two years ago."

Generate now:
`;

            const result = await window.electronAPI.generateWithOllama({
                baseUrl: appSettings.ollama.baseUrl,
                model: appSettings.ollama.model,
                prompt,
                temperature: 0.8,
            });

            if (result.success && result.response) {
                const history = cleanLLMResponse(result.response);
                setData(prev => ({...prev, contactHistory: history}));
            }
        } catch (err) {
            console.error('Failed to generate history:', err);
        } finally {
            setIsGeneratingHistory(false);
        }
    }, [ollamaEnabled, appSettings?.ollama, data.contactName, data.contactPersonality, data.contactDescription]);

    // Handle image saved from ImagePreviewGenerator
    const handleImageSaved = useCallback(async (savedPath: string) => {
        // Extract filename from the full path
        const filename = savedPath.replace(/\\/g, '/').split('/').pop() || '';
        setData(prev => ({...prev, profilePicturePath: filename}));

        // Reset filename key for next generation
        setImageFilenameKey(Date.now());

        // Refresh available images
        try {
            const imagesPath = `${projectPath}/Images`;
            const entries = await window.electronAPI.readDir(imagesPath);
            const images = entries
                .filter(e => !e.isDirectory && /\.(png|jpg|jpeg|webp|gif)$/i.test(e.name))
                .map(e => e.name);
            setAvailableImages(images);
        } catch {
            // Ignore refresh errors
        }
    }, [projectPath]);

    // Build portrait prompt from character config (only when appearance is available)
    const portraitPrompt = useMemo(() => {
        if (!characterConfig?.appearance) {
            return null;
        }
        return promptBuilder.buildPortraitPrompt(characterConfig.appearance);
    }, [characterConfig?.appearance]);

    // Generate a stable filename for image generation (updates when contactID changes or image is saved)
    const [imageFilenameKey, setImageFilenameKey] = useState(() => Date.now());
    const generatedImageFilename = useMemo(() => {
        return `${data.contactID || 'character'}_${imageFilenameKey}`;
    }, [data.contactID, imageFilenameKey]);

    // Filter images for gallery
    const filteredImages = useMemo(() => {
        if (!imageFilter) return availableImages;
        const lower = imageFilter.toLowerCase();
        return availableImages.filter(img => img.toLowerCase().includes(lower));
    }, [availableImages, imageFilter]);

    // Get image URL
    const getImageUrl = useCallback((filename: string) => {
        return window.electronAPI.getLocalFileUrl(`${projectPath}/Images/${filename}`);
    }, [projectPath]);

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
                <div className="content-view-spinner"/>
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
        <div className="content-view json-form-editor character-editor">
            <div className="json-editor-toolbar">
                <span style={{fontWeight: 600, color: '#d4d4d4'}}>Character Editor</span>
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
                <div className="json-form-section">
                    <div className="json-form-section-title">Identity</div>

                    <div className="json-form-field">
                        <div className="json-form-checkbox-wrapper">
                            <input
                                type="checkbox"
                                className="json-form-checkbox"
                                checked={data.isMainCharacter}
                                onChange={(e) => handleChange('isMainCharacter', e.target.checked)}
                                id="isMainCharacter"
                            />
                            <label htmlFor="isMainCharacter" className="json-form-checkbox-label">
                                Is Main Character (Player)
                            </label>
                        </div>
                        <div className="json-form-hint">Only one character can be the main/player character</div>
                    </div>

                    <div className="json-form-field">
                        <label className="json-form-label json-form-label-required">Contact ID</label>
                        <input
                            type="text"
                            className="json-form-input"
                            value={data.contactID}
                            onChange={(e) => handleChange('contactID', e.target.value)}
                            placeholder="character_id"
                        />
                        <div className="json-form-hint">Unique ID used in conversations (don't change after creation)
                        </div>
                    </div>

                    {/* Name fields with AI generation */}
                    <div className="json-form-field">
                        <div className="json-form-label-row">
                            <label className="json-form-label json-form-label-required">Name</label>
                            {ollamaEnabled && (
                                <div className="char-editor-ai-buttons">
                                    <button
                                        className="char-editor-ai-btn"
                                        onClick={() => generateName('male')}
                                        disabled={isGeneratingName}
                                        title="Generate random male name"
                                    >
                                        {isGeneratingName ? '...' : '♂ Male'}
                                    </button>
                                    <button
                                        className="char-editor-ai-btn"
                                        onClick={() => generateName('female')}
                                        disabled={isGeneratingName}
                                        title="Generate random female name"
                                    >
                                        {isGeneratingName ? '...' : '♀ Female'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="json-form-row">
                        <div className="json-form-field">
                            <label className="json-form-label">Full Name</label>
                            <input
                                type="text"
                                className="json-form-input"
                                value={data.contactName}
                                onChange={(e) => handleChange('contactName', e.target.value)}
                                placeholder="Sarah Johnson"
                            />
                        </div>
                        <div className="json-form-field">
                            <label className="json-form-label">Last Name</label>
                            <input
                                type="text"
                                className="json-form-input"
                                value={data.contactLastName || ''}
                                onChange={(e) => handleChange('contactLastName', e.target.value)}
                                placeholder="Johnson"
                            />
                        </div>
                    </div>

                    <div className="json-form-row">
                        <div className="json-form-field">
                            <label className="json-form-label json-form-label-required">Nickname</label>
                            <input
                                type="text"
                                className="json-form-input"
                                value={data.contactNickname}
                                onChange={(e) => handleChange('contactNickname', e.target.value)}
                                placeholder="Sarah"
                            />
                            <div className="json-form-hint">How they appear in conversations</div>
                        </div>
                        <div className="json-form-field">
                            <label className="json-form-label json-form-label-required">Short Nickname</label>
                            <input
                                type="text"
                                className="json-form-input"
                                value={data.contactNicknameShort}
                                onChange={(e) => handleChange('contactNicknameShort', e.target.value)}
                                placeholder="Sarah"
                            />
                            <div className="json-form-hint">Short version for UI elements</div>
                        </div>
                    </div>
                </div>

                <div className="json-form-section">
                    <div className="json-form-section-title">Appearance</div>

                    <div className="char-editor-appearance-grid">
                        {/* Current Profile Picture */}
                        <div className="char-editor-current-image">
                            <label className="json-form-label">Current Profile Picture</label>
                            {data.profilePicturePath ? (
                                <div className="char-editor-current-image-preview">
                                    <img
                                        src={getImageUrl(data.profilePicturePath)}
                                        alt="Profile preview"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = '';
                                            (e.target as HTMLImageElement).alt = 'Image not found';
                                        }}
                                    />
                                    <span className="char-editor-current-image-name">{data.profilePicturePath}</span>
                                </div>
                            ) : (
                                <div className="char-editor-no-image">
                                    <span>No image selected</span>
                                </div>
                            )}
                            <div className="char-editor-image-controls">
                                <input
                                    type="text"
                                    className="json-form-input"
                                    value={data.profilePicturePath}
                                    onChange={(e) => handleChange('profilePicturePath', e.target.value)}
                                    placeholder="character.png"
                                />
                                <button
                                    className="char-editor-ai-btn char-editor-ai-btn--secondary"
                                    onClick={() => setShowGallery(!showGallery)}
                                    type="button"
                                >
                                    {showGallery ? 'Hide' : 'Gallery'}
                                </button>
                            </div>
                        </div>

                        {/* Image Generator - only shown when appearance config is loaded */}
                        {comfyEnabled && portraitPrompt && (
                            <div className="char-editor-image-generator">
                                <label className="json-form-label">Generate New Image</label>
                                <ImagePreviewGenerator
                                    positivePrompt={portraitPrompt.positive}
                                    negativePrompt={portraitPrompt.negative}
                                    projectPath={projectPath}
                                    destFolder={`${projectPath}/Images`}
                                    destFilename={generatedImageFilename}
                                    onImageSaved={handleImageSaved}
                                    placeholder="Generate portrait"
                                    saveToDisk={true}
                                />
                            </div>
                        )}
                        {comfyEnabled && !portraitPrompt && (
                            <div className="char-editor-image-generator">
                                <label className="json-form-label">Generate New Image</label>
                                <div className="json-form-hint" style={{color: '#f0ad4e'}}>
                                    Set appearance in the .conf file to enable image generation
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Image gallery */}
                    {showGallery && (
                        <div className="char-editor-gallery">
                            <div className="char-editor-gallery-header">
                                <span>Available Images ({availableImages.length})</span>
                                {availableImages.length > 6 && (
                                    <input
                                        type="text"
                                        className="char-editor-gallery-filter"
                                        placeholder="Filter..."
                                        value={imageFilter}
                                        onChange={(e) => setImageFilter(e.target.value)}
                                    />
                                )}
                            </div>
                            <div className="char-editor-gallery-grid">
                                {filteredImages.length > 0 ? (
                                    filteredImages.map(img => (
                                        <button
                                            key={img}
                                            className={`char-editor-gallery-item ${data.profilePicturePath === img ? 'selected' : ''}`}
                                            onClick={() => handleChange('profilePicturePath', img)}
                                            type="button"
                                        >
                                            <img src={getImageUrl(img)} alt={img}/>
                                            <span>{img}</span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="char-editor-gallery-empty">
                                        {availableImages.length === 0 ? 'No images in /Images folder' : 'No matching images'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="json-form-row">
                        <div className="json-form-field">
                            <label className="json-form-label">Character Color</label>
                            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                <input
                                    type="color"
                                    value={data.characterColorHex || '#ffffff'}
                                    onChange={(e) => handleChange('characterColorHex', e.target.value)}
                                    style={{width: 40, height: 32, padding: 0, border: 'none', cursor: 'pointer'}}
                                />
                                <input
                                    type="text"
                                    className="json-form-input"
                                    value={data.characterColorHex || ''}
                                    onChange={(e) => handleChange('characterColorHex', e.target.value)}
                                    placeholder="#ff6b35"
                                    style={{maxWidth: 120}}
                                />
                            </div>
                        </div>
                        <div className="json-form-field">
                            <div className="json-form-checkbox-wrapper" style={{marginTop: 24}}>
                                <input
                                    type="checkbox"
                                    className="json-form-checkbox"
                                    checked={data.showContactFromStart || false}
                                    onChange={(e) => handleChange('showContactFromStart', e.target.checked)}
                                    id="showFromStart"
                                />
                                <label htmlFor="showFromStart" className="json-form-checkbox-label">
                                    Show Contact From Start
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="json-form-section">
                    <div className="json-form-section-title">Character Details</div>

                    {/* Personality */}
                    <div className="json-form-field">
                        <div className="json-form-label-row">
                            <label className="json-form-label">Personality</label>
                            {ollamaEnabled && (
                                <div className="char-editor-ai-buttons">
                                    <button
                                        className="char-editor-ai-btn"
                                        onClick={() => generatePersonality()}
                                        disabled={isGeneratingPersonality}
                                        title="Generate random personality"
                                    >
                                        {isGeneratingPersonality ? '...' : 'Random'}
                                    </button>
                                </div>
                            )}
                        </div>
                        {ollamaEnabled && (
                            <div className="char-editor-presets">
                                {PERSONALITY_PRESETS.map(preset => (
                                    <button
                                        key={preset.label}
                                        className="char-editor-preset-btn"
                                        onClick={() => generatePersonality(preset.prompt)}
                                        disabled={isGeneratingPersonality}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <textarea
                            className="json-form-input json-form-textarea"
                            value={data.contactPersonality || ''}
                            onChange={(e) => handleChange('contactPersonality', e.target.value)}
                            placeholder="Character's personality traits..."
                        />
                    </div>

                    {/* Description */}
                    <div className="json-form-field">
                        <div className="json-form-label-row">
                            <label className="json-form-label">Description</label>
                            {ollamaEnabled && (
                                <div className="char-editor-ai-buttons">
                                    <button
                                        className="char-editor-ai-btn"
                                        onClick={() => generateDescription()}
                                        disabled={isGeneratingDescription}
                                        title="Generate random description"
                                    >
                                        {isGeneratingDescription ? '...' : 'Random'}
                                    </button>
                                </div>
                            )}
                        </div>
                        {ollamaEnabled && (
                            <div className="char-editor-presets">
                                {DESCRIPTION_PRESETS.map(preset => (
                                    <button
                                        key={preset.label}
                                        className="char-editor-preset-btn"
                                        onClick={() => generateDescription(preset.prompt)}
                                        disabled={isGeneratingDescription}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <textarea
                            className="json-form-input json-form-textarea"
                            value={data.contactDescription || ''}
                            onChange={(e) => handleChange('contactDescription', e.target.value)}
                            placeholder="A brief description of this character..."
                        />
                    </div>

                    {/* History */}
                    <div className="json-form-field">
                        <div className="json-form-label-row">
                            <label className="json-form-label">History</label>
                            {ollamaEnabled && (
                                <div className="char-editor-ai-buttons">
                                    <button
                                        className="char-editor-ai-btn"
                                        onClick={() => generateHistory()}
                                        disabled={isGeneratingHistory}
                                        title="Generate random history"
                                    >
                                        {isGeneratingHistory ? '...' : 'Random'}
                                    </button>
                                </div>
                            )}
                        </div>
                        {ollamaEnabled && (
                            <div className="char-editor-presets">
                                {HISTORY_PRESETS.map(preset => (
                                    <button
                                        key={preset.label}
                                        className="char-editor-preset-btn"
                                        onClick={() => generateHistory(preset.prompt)}
                                        disabled={isGeneratingHistory}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <textarea
                            className="json-form-input json-form-textarea"
                            value={data.contactHistory || ''}
                            onChange={(e) => handleChange('contactHistory', e.target.value)}
                            placeholder="Character's background and history..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CharacterJsonEditor;
