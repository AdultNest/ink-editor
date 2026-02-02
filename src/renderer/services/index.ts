/**
 * Services barrel export
 *
 * Central export point for all renderer services.
 */

// Prompt Builder Service
export {
  promptBuilder,
  PromptBuilderService,
  PromptRegion,
  APPEARANCE_ATTRIBUTES,
  DEFAULT_QUALITY_TAGS,
  DEFAULT_NEGATIVE_TAGS,
  SHOT_REGION_MAP,
  type AttributeOption,
  type CharacterAppearance,
  type CharacterConfig,
  type GeneratedPrompt,
  type ShotType,
} from './promptBuilder';

// Prompt Library Service
export {
  promptLibraryService,
  PromptLibraryServiceClass,
  PROMPT_LIBRARY_FILENAME,
  getDefaultLibrary,
} from './promptLibraryService';

// Re-export ensureProjectFiles as a convenience function
export const ensureProjectFiles = (projectPath: string) =>
  import('./promptLibraryService').then(m => m.promptLibraryService.ensureProjectFiles(projectPath));

// Prompt Library Types
export {
  PromptComponentCategory,
  CATEGORY_INFO,
  getCategoryInfo,
  type ProjectPromptLibrary,
  type PromptComponent,
  type CategoryInfo,
} from './promptLibrary.types';
