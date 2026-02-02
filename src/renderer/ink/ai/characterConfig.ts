/**
 * Character AI Configuration
 *
 * Handles loading and managing character-specific AI generation settings.
 * Each character can have a .conf.json file with:
 * - Image generation prompt sets (visual appearance descriptors)
 * - Ollama mood sets (personality and behavior descriptors)
 * - Character appearance data for prompt building
 */

import type { CharacterAppearance, CharacterConfig } from '../../../renderer/services/promptBuilder';

/**
 * Image generation prompt set for a character
 */
export interface ImagePromptSet {
  /** Name of this prompt set (e.g., "casual", "formal", "angry") */
  name: string;
  /** Positive prompts to include (e.g., "1girl, brown hair, blue eyes") */
  positive: string;
  /** Negative prompts to exclude (e.g., "bad quality, blurry") */
  negative?: string;
}

/**
 * Mood/personality set for text generation
 */
export interface MoodSet {
  /** Name of this mood (e.g., "friendly", "annoyed", "flirty") */
  name: string;
  /** Description of personality traits and behaviors */
  description: string;
}

/**
 * Character JSON metadata (from characterid.json)
 */
export interface CharacterMeta {
  /** Whether this is the main/player character */
  isMainCharacter: boolean;
  /** Contact ID */
  contactID: string;
  /** Display name */
  contactName: string;
  /** Profile picture filename */
  profilePicturePath?: string;
  /** Character color */
  characterColorHex?: string;
}

/**
 * Character AI configuration stored in characterid.conf.json
 */
export interface CharacterAIConfig {
  /** Character ID this config belongs to */
  characterId: string;
  /** Default image prompt set name to use */
  defaultImagePromptSet?: string;
  /** Default mood set name to use */
  defaultMoodSet?: string;
  /** Image generation prompt sets */
  imagePromptSets: ImagePromptSet[];
  /** Mood/personality sets for text generation */
  moodSets: MoodSet[];
  /** Character appearance data for prompt building */
  appearance?: CharacterAppearance;
  /** Character metadata from JSON file */
  meta?: CharacterMeta;
}

/**
 * Conversation metadata loaded from the paired JSON file
 */
export interface ConversationMeta {
  /** Contact ID of the character in this conversation */
  contactID?: string;
  /** Story ID */
  storyId?: string;
  /** For injections - sender ID */
  senderId?: string;
}

/**
 * Default empty character config
 */
export const DEFAULT_CHARACTER_CONFIG: CharacterAIConfig = {
  characterId: '',
  imagePromptSets: [],
  moodSets: [],
};

/**
 * Load conversation metadata from the paired settings JSON file
 * e.g., conversation.ink -> conversation-settings.json
 */
export async function loadConversationMeta(inkFilePath: string): Promise<ConversationMeta | null> {
  try {
    // Replace .ink with -settings.json
    const jsonPath = inkFilePath.replace(/\.ink$/i, '-settings.json');

    const exists = await window.electronAPI.fileExists(jsonPath);
    if (!exists) {
      console.log('[CharacterConfig] No paired settings file found:', jsonPath);
      return null;
    }

    const content = await window.electronAPI.readFile(jsonPath);
    const data = JSON.parse(content);

    // Handle both conversation and injection formats
    if (data.contactID) {
      return {
        contactID: data.contactID,
        storyId: data.storyId,
      };
    } else if (data.conversationsToReceive && data.conversationsToReceive.length > 0) {
      // For injections, use the first conversation's contactId or senderId
      const firstConv = data.conversationsToReceive[0];
      return {
        contactID: firstConv.contactId || firstConv.senderId,
        storyId: data.injectionId,
        senderId: firstConv.senderId,
      };
    }

    return null;
  } catch (err) {
    console.error('[CharacterConfig] Failed to load conversation meta:', err);
    return null;
  }
}

/**
 * Find the Characters folder in the project
 */
export async function findCharactersFolder(projectPath: string): Promise<string | null> {
  const pathSeparator = projectPath.includes('\\') ? '\\' : '/';

  // Try common locations
  const possiblePaths = [
    `${projectPath}${pathSeparator}Characters`,
    `${projectPath}${pathSeparator}characters`,
  ];

  for (const charPath of possiblePaths) {
    try {
      const exists = await window.electronAPI.fileExists(charPath);
      if (exists) {
        return charPath;
      }
    } catch {
      // Ignore errors
    }
  }

  return null;
}

/**
 * Load character JSON metadata (contactName, profilePicture, isMainCharacter, etc.)
 */
export async function loadCharacterMeta(
  projectPath: string,
  characterId: string
): Promise<CharacterMeta | null> {
  try {
    const charactersFolder = await findCharactersFolder(projectPath);
    if (!charactersFolder) {
      return null;
    }

    const pathSeparator = projectPath.includes('\\') ? '\\' : '/';
    const jsonPath = `${charactersFolder}${pathSeparator}${characterId}.json`;

    const exists = await window.electronAPI.fileExists(jsonPath);
    if (!exists) {
      return null;
    }

    const content = await window.electronAPI.readFile(jsonPath);
    const data = JSON.parse(content);

    return {
      isMainCharacter: data.isMainCharacter || false,
      contactID: data.contactID || characterId,
      contactName: data.contactName || characterId,
      profilePicturePath: data.profilePicturePath,
      characterColorHex: data.characterColorHex,
    };
  } catch (err) {
    console.error('[CharacterConfig] Failed to load character meta:', err);
    return null;
  }
}

/**
 * Find the main character (isMainCharacter = true) in the project
 */
export async function findMainCharacter(projectPath: string): Promise<CharacterAIConfig | null> {
  try {
    const charactersFolder = await findCharactersFolder(projectPath);
    if (!charactersFolder) {
      return null;
    }

    // List all JSON files in characters folder
    const entries = await window.electronAPI.readDir(charactersFolder);
    const jsonFiles = entries
      .filter(entry => entry.name.endsWith('.json'))
      .map(entry => entry.name);

    for (const jsonFile of jsonFiles) {
      const pathSeparator = projectPath.includes('\\') ? '\\' : '/';
      const jsonPath = `${charactersFolder}${pathSeparator}${jsonFile}`;

      try {
        const content = await window.electronAPI.readFile(jsonPath);
        const data = JSON.parse(content);

        if (data.isMainCharacter === true) {
          const characterId = data.contactID || jsonFile.replace('.json', '');
          // Load full config for this character
          return await loadCharacterConfig(projectPath, characterId);
        }
      } catch {
        // Skip invalid files
      }
    }

    return null;
  } catch (err) {
    console.error('[CharacterConfig] Failed to find main character:', err);
    return null;
  }
}

/**
 * Load character AI configuration from the .conf file
 * Also loads appearance data and character metadata
 */
export async function loadCharacterConfig(
  projectPath: string,
  characterId: string
): Promise<CharacterAIConfig | null> {
  try {
    const charactersFolder = await findCharactersFolder(projectPath);
    if (!charactersFolder) {
      console.log('[CharacterConfig] Characters folder not found');
      return null;
    }

    const pathSeparator = projectPath.includes('\\') ? '\\' : '/';
    const configPath = `${charactersFolder}${pathSeparator}${characterId}.conf`;

    const exists = await window.electronAPI.fileExists(configPath);
    if (!exists) {
      console.log('[CharacterConfig] Config file not found:', configPath);
      return null;
    }

    const content = await window.electronAPI.readFile(configPath);
    const config = JSON.parse(content) as CharacterConfig & CharacterAIConfig;

    // Also load character metadata from JSON file
    const meta = await loadCharacterMeta(projectPath, characterId);

    // Ensure required fields
    return {
      characterId: config.characterId || characterId,
      defaultImagePromptSet: config.defaultImagePromptSet,
      defaultMoodSet: config.defaultMoodSet,
      imagePromptSets: config.imagePromptSets || [],
      moodSets: config.moodSets || [],
      appearance: config.appearance,
      meta: meta || undefined,
    };
  } catch (err) {
    console.error('[CharacterConfig] Failed to load character config:', err);
    return null;
  }
}

/**
 * Save character AI configuration to the .conf file
 */
export async function saveCharacterConfig(
  projectPath: string,
  characterId: string,
  config: CharacterAIConfig
): Promise<boolean> {
  try {
    const charactersFolder = await findCharactersFolder(projectPath);
    if (!charactersFolder) {
      console.error('[CharacterConfig] Characters folder not found');
      return false;
    }

    const pathSeparator = projectPath.includes('\\') ? '\\' : '/';
    const configPath = `${charactersFolder}${pathSeparator}${characterId}.conf`;

    const content = JSON.stringify(config, null, 2);
    await window.electronAPI.writeFile(configPath, content);

    console.log('[CharacterConfig] Saved config to:', configPath);
    return true;
  } catch (err) {
    console.error('[CharacterConfig] Failed to save character config:', err);
    return false;
  }
}

/**
 * Get a specific image prompt set by name
 */
export function getImagePromptSet(
  config: CharacterAIConfig,
  name?: string
): ImagePromptSet | undefined {
  const targetName = name || config.defaultImagePromptSet;
  if (!targetName) {
    return config.imagePromptSets[0];
  }
  return config.imagePromptSets.find(p => p.name === targetName);
}

/**
 * Get a specific mood set by name
 */
export function getMoodSet(
  config: CharacterAIConfig,
  name?: string
): MoodSet | undefined {
  const targetName = name || config.defaultMoodSet;
  if (!targetName) {
    return config.moodSets[0];
  }
  return config.moodSets.find(m => m.name === targetName);
}

/**
 * Build image prompt with character's base prompts
 */
export function buildImagePromptWithCharacter(
  userPrompt: string,
  characterConfig: CharacterAIConfig | null,
  promptSetName?: string
): { positive: string; negative: string } {
  const promptSet = characterConfig ? getImagePromptSet(characterConfig, promptSetName) : undefined;

  let positive = userPrompt;
  let negative = '';

  if (promptSet) {
    // Prepend character's base prompts
    positive = promptSet.positive ? `${promptSet.positive}, ${userPrompt}` : userPrompt;
    negative = promptSet.negative || '';
  }

  return { positive, negative };
}

/**
 * Build text generation system prompt with character's mood
 */
export function buildSystemPromptWithMood(
  baseSystemPrompt: string,
  characterConfig: CharacterAIConfig | null,
  moodSetName?: string
): string {
  const moodSet = characterConfig ? getMoodSet(characterConfig, moodSetName) : undefined;

  if (!moodSet) {
    return baseSystemPrompt;
  }

  // Inject character personality into system prompt
  return `${baseSystemPrompt}

CHARACTER PERSONALITY:
${moodSet.description}

Write dialogue that reflects this personality.`;
}
