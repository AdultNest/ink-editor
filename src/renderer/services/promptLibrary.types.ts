/**
 * Prompt Library Types
 *
 * Type definitions for the project-level prompt library system.
 * Prompt libraries are stored as .prompt-library.json files in the project root.
 */

/** Categories for prompt components */
export enum PromptComponentCategory {
  LOCATION = 'location',
  CLOTHING = 'clothing',
  ACTION = 'action',
  TIME_WEATHER = 'time_weather',
}

/** A single reusable prompt component */
export interface PromptComponent {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Category for organization */
  category: PromptComponentCategory;
  /** Positive prompt tags */
  positive: string;
  /** Optional negative prompt tags */
  negative?: string;
  /** Optional tags for search/filter */
  tags?: string[];
}

/** Project prompt library structure (stored in .prompt-library.json) */
export interface ProjectPromptLibrary {
  /** Version number for future compatibility */
  version: number;
  /** Array of prompt components */
  components: PromptComponent[];
}

/** Category display info */
export interface CategoryInfo {
  category: PromptComponentCategory;
  label: string;
  description: string;
  icon: string;
}

/** All category info for UI display */
export const CATEGORY_INFO: CategoryInfo[] = [
  {
    category: PromptComponentCategory.LOCATION,
    label: 'Locations',
    description: 'Places and settings for scenes',
    icon: '📍',
  },
  {
    category: PromptComponentCategory.CLOTHING,
    label: 'Clothing',
    description: 'Outfits and attire',
    icon: '👕',
  },
  {
    category: PromptComponentCategory.ACTION,
    label: 'Actions',
    description: 'Poses and activities',
    icon: '🏃',
  },
  {
    category: PromptComponentCategory.TIME_WEATHER,
    label: 'Time & Weather',
    description: 'Lighting and atmospheric conditions',
    icon: '🌤️',
  },
];

/** Get category info by category enum */
export function getCategoryInfo(category: PromptComponentCategory): CategoryInfo | undefined {
  return CATEGORY_INFO.find(info => info.category === category);
}
