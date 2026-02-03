/**
 * Prompt Library Service
 *
 * Service for managing project-level prompt libraries.
 * Handles loading, saving, and querying prompt components.
 */

import {
  type ProjectPromptLibrary,
  type PromptComponent,
  PromptComponentCategory,
} from './promptLibrary.types';
import type { GeneratedPrompt } from './promptBuilder';

/** Current library version */
const LIBRARY_VERSION = 2;

/** Filename for prompt library */
export const PROMPT_LIBRARY_FILENAME = '.prompt-library.json';

/**
 * Default prompt library with common components
 */
export function getDefaultLibrary(): ProjectPromptLibrary {
  return {
    version: LIBRARY_VERSION,
    components: [
      // Locations
      { id: 'loc_cafe', name: 'Cafe', category: PromptComponentCategory.LOCATION, positive: 'cafe, coffee shop, indoor, cozy atmosphere, warm lighting', negative: 'outdoor' },
      { id: 'loc_beach', name: 'Beach', category: PromptComponentCategory.LOCATION, positive: 'beach, ocean, sand, seaside, waves', negative: 'indoor' },
      { id: 'loc_office', name: 'Office', category: PromptComponentCategory.LOCATION, positive: 'office, desk, modern office, professional setting', negative: 'outdoor, nature' },
      { id: 'loc_park', name: 'Park', category: PromptComponentCategory.LOCATION, positive: 'park, outdoor, trees, grass, nature, sunny', negative: 'indoor' },
      { id: 'loc_bedroom', name: 'Bedroom', category: PromptComponentCategory.LOCATION, positive: 'bedroom, bed, indoor, private room, cozy', negative: 'outdoor' },
      { id: 'loc_kitchen', name: 'Kitchen', category: PromptComponentCategory.LOCATION, positive: 'kitchen, cooking, indoor, domestic', negative: 'outdoor' },
      { id: 'loc_library', name: 'Library', category: PromptComponentCategory.LOCATION, positive: 'library, books, bookshelves, quiet, reading room', negative: 'outdoor' },
      { id: 'loc_street', name: 'Street', category: PromptComponentCategory.LOCATION, positive: 'street, urban, city, outdoors, buildings', negative: 'indoor' },
      { id: 'loc_forest', name: 'Forest', category: PromptComponentCategory.LOCATION, positive: 'forest, trees, nature, woodland, outdoor', negative: 'indoor, urban' },
      { id: 'loc_gym', name: 'Gym', category: PromptComponentCategory.LOCATION, positive: 'gym, fitness center, exercise equipment, workout', negative: 'outdoor' },

      // Clothing
      { id: 'cloth_casual', name: 'Casual', category: PromptComponentCategory.CLOTHING, positive: 'casual clothes, relaxed outfit, comfortable attire', negative: 'formal wear, suit' },
      { id: 'cloth_formal', name: 'Formal', category: PromptComponentCategory.CLOTHING, positive: 'formal attire, elegant dress, sophisticated outfit', negative: 'casual, athletic' },
      { id: 'cloth_suit', name: 'Business Suit', category: PromptComponentCategory.CLOTHING, positive: 'business suit, professional attire, dress shirt, tie', negative: 'casual, swimwear' },
      { id: 'cloth_dress', name: 'Summer Dress', category: PromptComponentCategory.CLOTHING, positive: 'summer dress, floral dress, light fabric, feminine', negative: 'winter clothes, suit' },
      { id: 'cloth_swim', name: 'Swimwear', category: PromptComponentCategory.CLOTHING, positive: 'swimwear, bikini, swimsuit, beach attire', negative: 'formal, winter clothes' },
      { id: 'cloth_winter', name: 'Winter Coat', category: PromptComponentCategory.CLOTHING, positive: 'winter coat, warm clothes, scarf, layers', negative: 'swimwear, summer clothes' },
      { id: 'cloth_athletic', name: 'Athletic Wear', category: PromptComponentCategory.CLOTHING, positive: 'athletic wear, sports clothes, workout outfit, activewear', negative: 'formal, suit' },
      { id: 'cloth_sleep', name: 'Sleepwear', category: PromptComponentCategory.CLOTHING, positive: 'sleepwear, pajamas, nightwear, comfortable', negative: 'formal, athletic' },

      // Actions
      { id: 'act_sitting', name: 'Sitting', category: PromptComponentCategory.ACTION, positive: 'sitting, seated, sitting down', negative: 'standing, walking, running' },
      { id: 'act_standing', name: 'Standing', category: PromptComponentCategory.ACTION, positive: 'standing, upright, standing pose', negative: 'sitting, lying down' },
      { id: 'act_walking', name: 'Walking', category: PromptComponentCategory.ACTION, positive: 'walking, strolling, moving', negative: 'sitting, standing still' },
      { id: 'act_running', name: 'Running', category: PromptComponentCategory.ACTION, positive: 'running, jogging, athletic movement', negative: 'sitting, standing still' },
      { id: 'act_reading', name: 'Reading', category: PromptComponentCategory.ACTION, positive: 'reading, holding book, focused on book', negative: 'looking at camera' },
      { id: 'act_eating', name: 'Eating', category: PromptComponentCategory.ACTION, positive: 'eating, dining, with food', negative: '' },
      { id: 'act_drinking', name: 'Drinking', category: PromptComponentCategory.ACTION, positive: 'drinking, holding drink, cup, glass', negative: '' },
      { id: 'act_talking', name: 'Talking', category: PromptComponentCategory.ACTION, positive: 'talking, speaking, conversation, open mouth', negative: 'silent' },
      { id: 'act_sleeping', name: 'Sleeping', category: PromptComponentCategory.ACTION, positive: 'sleeping, asleep, closed eyes, resting', negative: 'awake, standing' },
      { id: 'act_working', name: 'Working', category: PromptComponentCategory.ACTION, positive: 'working, focused, at desk, typing', negative: 'relaxing' },

      // Time & Weather
      { id: 'time_morning', name: 'Morning', category: PromptComponentCategory.TIME_WEATHER, positive: 'morning, sunrise, early day, golden hour, warm light', negative: 'night, dark' },
      { id: 'time_afternoon', name: 'Afternoon', category: PromptComponentCategory.TIME_WEATHER, positive: 'afternoon, daylight, midday, bright', negative: 'night, dark' },
      { id: 'time_evening', name: 'Evening', category: PromptComponentCategory.TIME_WEATHER, positive: 'evening, sunset, dusk, orange sky, golden hour', negative: 'midday, morning' },
      { id: 'time_night', name: 'Night', category: PromptComponentCategory.TIME_WEATHER, positive: 'night, nighttime, dark, moonlight, artificial lighting', negative: 'daylight, sunny' },
      { id: 'weather_sunny', name: 'Sunny', category: PromptComponentCategory.TIME_WEATHER, positive: 'sunny, bright, clear sky, sunlight, warm', negative: 'cloudy, rainy, dark' },
      { id: 'weather_cloudy', name: 'Cloudy', category: PromptComponentCategory.TIME_WEATHER, positive: 'cloudy, overcast, grey sky, diffused light', negative: 'sunny, clear sky' },
      { id: 'weather_rainy', name: 'Rainy', category: PromptComponentCategory.TIME_WEATHER, positive: 'rainy, rain, wet, raindrops, umbrella', negative: 'sunny, dry' },
      { id: 'weather_snowy', name: 'Snowy', category: PromptComponentCategory.TIME_WEATHER, positive: 'snowy, snow, winter, cold, white', negative: 'summer, warm' },
      { id: 'weather_foggy', name: 'Foggy', category: PromptComponentCategory.TIME_WEATHER, positive: 'foggy, misty, fog, hazy, atmospheric', negative: 'clear, sunny' },

      // Image Styles
      { id: 'style_realistic', name: 'Realistic', category: PromptComponentCategory.IMAGE_STYLE, positive: 'realistic, photorealistic, photo, real life', negative: 'anime, cartoon, drawing' },
      { id: 'style_anime', name: 'Anime', category: PromptComponentCategory.IMAGE_STYLE, positive: 'anime, anime style, manga style, japanese animation', negative: 'realistic, photo, 3d render' },
      { id: 'style_digital_art', name: 'Digital Art', category: PromptComponentCategory.IMAGE_STYLE, positive: 'digital art, digital painting, digital illustration', negative: 'photo, realistic' },
      { id: 'style_oil_painting', name: 'Oil Painting', category: PromptComponentCategory.IMAGE_STYLE, positive: 'oil painting, classical painting, painted, brush strokes', negative: 'photo, digital, anime' },
      { id: 'style_watercolor', name: 'Watercolor', category: PromptComponentCategory.IMAGE_STYLE, positive: 'watercolor, watercolor painting, soft colors, flowing paint', negative: 'photo, digital, sharp lines' },
      { id: 'style_3d_render', name: '3D Render', category: PromptComponentCategory.IMAGE_STYLE, positive: '3d render, 3d art, cgi, rendered, octane render', negative: 'hand drawn, painting, 2d' },
      { id: 'style_comic', name: 'Comic Book', category: PromptComponentCategory.IMAGE_STYLE, positive: 'comic book, comic art, western comic, graphic novel style', negative: 'realistic, photo, anime' },
      { id: 'style_pixel', name: 'Pixel Art', category: PromptComponentCategory.IMAGE_STYLE, positive: 'pixel art, 8-bit, retro game, pixelated', negative: 'realistic, high resolution, smooth' },

      // Moods (for text generation)
      { id: 'mood_friendly', name: 'Friendly', category: PromptComponentCategory.MOOD, positive: 'friendly expression, warm smile, approachable', negative: 'angry, hostile', description: 'Warm, approachable, uses casual language and humor. Genuinely interested in conversation and makes others feel comfortable.' },
      { id: 'mood_flirty', name: 'Flirty', category: PromptComponentCategory.MOOD, positive: 'flirty expression, playful smile, charming', negative: 'serious, cold', description: 'Playful and charming, uses subtle compliments and teasing. Shows romantic interest while maintaining respect.' },
      { id: 'mood_serious', name: 'Serious', category: PromptComponentCategory.MOOD, positive: 'serious expression, focused, determined', negative: 'smiling, playful', description: 'Direct and focused, professional tone. Speaks thoughtfully about important matters.' },
      { id: 'mood_shy', name: 'Shy', category: PromptComponentCategory.MOOD, positive: 'shy expression, bashful, looking away, blushing', negative: 'confident, bold', description: 'Reserved and hesitant, uses shorter sentences. Takes time to open up and speaks softly.' },
      { id: 'mood_confident', name: 'Confident', category: PromptComponentCategory.MOOD, positive: 'confident expression, self-assured, bold pose', negative: 'shy, uncertain', description: 'Self-assured and bold, takes initiative in conversation. Speaks with certainty and charisma.' },
      { id: 'mood_mysterious', name: 'Mysterious', category: PromptComponentCategory.MOOD, positive: 'mysterious expression, enigmatic, subtle smile', negative: 'open, obvious', description: 'Enigmatic and intriguing, speaks in hints and riddles. Reveals little while maintaining interest.' },
      { id: 'mood_angry', name: 'Angry', category: PromptComponentCategory.MOOD, positive: 'angry expression, frown, furrowed brow', negative: 'happy, smiling', description: 'Frustrated and confrontational, uses sharp words. Direct about displeasure but can be reasoned with.' },
      { id: 'mood_sad', name: 'Sad', category: PromptComponentCategory.MOOD, positive: 'sad expression, melancholic, downcast eyes', negative: 'happy, energetic', description: 'Melancholic and speaks softly, needs comfort. May be withdrawn but appreciates support.' },
    ],
  };
}

/**
 * Prompt Library Service
 */
class PromptLibraryServiceClass {
  /**
   * Load a prompt library from a project path
   */
  async loadLibrary(projectPath: string): Promise<ProjectPromptLibrary> {
    const libraryPath = this.getLibraryPath(projectPath);

    try {
      const exists = await window.electronAPI.fileExists(libraryPath);
      if (!exists) {
        return getDefaultLibrary();
      }

      const content = await window.electronAPI.readFile(libraryPath);
      const library = JSON.parse(content) as ProjectPromptLibrary;

      // Ensure library has valid structure
      const validLibrary: ProjectPromptLibrary = {
        version: library?.version ?? LIBRARY_VERSION,
        components: Array.isArray(library?.components) ? library.components : [],
      };

      // Validate and migrate if needed
      if (validLibrary.version < LIBRARY_VERSION) {
        return this.migrateLibrary(validLibrary);
      }

      return validLibrary;
    } catch (error) {
      console.error('Failed to load prompt library:', error);
      return getDefaultLibrary();
    }
  }

  /**
   * Ensure project has required files (prompt library, methods.conf)
   * Creates them with defaults if they don't exist
   */
  async ensureProjectFiles(projectPath: string): Promise<void> {
    const separator = projectPath.includes('\\') ? '\\' : '/';

    // Ensure prompt library exists
    const libraryPath = this.getLibraryPath(projectPath);
    try {
      const libraryExists = await window.electronAPI.fileExists(libraryPath);
      if (!libraryExists) {
        const content = JSON.stringify(getDefaultLibrary(), null, 2);
        await window.electronAPI.createFile(libraryPath, content);
      }
    } catch (error) {
      console.error('Failed to create prompt library:', error);
    }

    // Ensure methods.conf exists
    const methodsConfPath = `${projectPath}${separator}methods.conf`;
    try {
      const methodsExists = await window.electronAPI.fileExists(methodsConfPath);
      if (!methodsExists) {
        const content = JSON.stringify({ availableMethods: [] }, null, 2);
        await window.electronAPI.createFile(methodsConfPath, content);
      }
    } catch (error) {
      console.error('Failed to create methods.conf:', error);
    }
  }

  /**
   * Save a prompt library to a project path
   */
  async saveLibrary(projectPath: string, library: ProjectPromptLibrary): Promise<void> {
    const libraryPath = this.getLibraryPath(projectPath);
    const content = JSON.stringify(library, null, 2);
    await window.electronAPI.writeFile(libraryPath, content);
  }

  /**
   * Get the library file path for a project
   */
  getLibraryPath(projectPath: string): string {
    const separator = projectPath.includes('\\') ? '\\' : '/';
    return `${projectPath}${separator}${PROMPT_LIBRARY_FILENAME}`;
  }

  /**
   * Ensure library has valid components array
   */
  private ensureComponents(library: ProjectPromptLibrary): PromptComponent[] {
    return library?.components ?? [];
  }

  /**
   * Get components by category
   */
  getComponentsByCategory(library: ProjectPromptLibrary, category: PromptComponentCategory): PromptComponent[] {
    return this.ensureComponents(library).filter(c => c.category === category);
  }

  /**
   * Get a component by ID
   */
  getComponentById(library: ProjectPromptLibrary, id: string): PromptComponent | undefined {
    return this.ensureComponents(library).find(c => c.id === id);
  }

  /**
   * Build a prompt from selected component IDs
   */
  buildPromptFromComponents(library: ProjectPromptLibrary, componentIds: string[]): GeneratedPrompt {
    const positiveParts: string[] = [];
    const negativeParts: string[] = [];

    for (const id of componentIds) {
      const component = this.getComponentById(library, id);
      if (component) {
        if (component.positive) {
          positiveParts.push(component.positive);
        }
        if (component.negative) {
          negativeParts.push(component.negative);
        }
      }
    }

    return {
      positive: positiveParts.filter(Boolean).join(', '),
      negative: negativeParts.filter(Boolean).join(', '),
    };
  }

  /**
   * Add a component to the library
   */
  addComponent(library: ProjectPromptLibrary, component: Omit<PromptComponent, 'id'>): ProjectPromptLibrary {
    const id = this.generateId(component.name);
    return {
      ...library,
      components: [...this.ensureComponents(library), { ...component, id }],
    };
  }

  /**
   * Update a component in the library
   */
  updateComponent(library: ProjectPromptLibrary, id: string, updates: Partial<PromptComponent>): ProjectPromptLibrary {
    return {
      ...library,
      components: this.ensureComponents(library).map(c =>
        c.id === id ? { ...c, ...updates } : c
      ),
    };
  }

  /**
   * Delete a component from the library
   */
  deleteComponent(library: ProjectPromptLibrary, id: string): ProjectPromptLibrary {
    return {
      ...library,
      components: this.ensureComponents(library).filter(c => c.id !== id),
    };
  }

  /**
   * Search components by name or tags
   */
  searchComponents(library: ProjectPromptLibrary, query: string): PromptComponent[] {
    const lowerQuery = query.toLowerCase();
    return this.ensureComponents(library).filter(c => {
      const nameMatch = c.name.toLowerCase().includes(lowerQuery);
      const tagMatch = c.tags?.some(t => t.toLowerCase().includes(lowerQuery));
      const positiveMatch = c.positive.toLowerCase().includes(lowerQuery);
      return nameMatch || tagMatch || positiveMatch;
    });
  }

  /**
   * Get mood description by component ID
   * Returns the description field for MOOD category components
   */
  getMoodDescription(library: ProjectPromptLibrary, moodId: string): string | null {
    const component = this.getComponentById(library, moodId);
    if (!component || component.category !== PromptComponentCategory.MOOD) {
      return null;
    }
    return component.description || null;
  }

  /**
   * Get image style prompt by component ID
   * Returns positive/negative prompts for IMAGE_STYLE category components
   */
  getImageStylePrompt(library: ProjectPromptLibrary, styleId: string): { positive: string; negative: string } | null {
    const component = this.getComponentById(library, styleId);
    if (!component || component.category !== PromptComponentCategory.IMAGE_STYLE) {
      return null;
    }
    return { positive: component.positive, negative: component.negative || '' };
  }

  /**
   * Generate a unique ID from a name
   */
  private generateId(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const timestamp = Date.now().toString(36);
    return `${base}_${timestamp}`;
  }

  /**
   * Migrate an older library version to the current version
   */
  private migrateLibrary(library: ProjectPromptLibrary): ProjectPromptLibrary {
    // For now, just update the version
    return {
      ...library,
      version: LIBRARY_VERSION,
    };
  }
}

// Export a singleton instance
export const promptLibraryService = new PromptLibraryServiceClass();

// Also export the class for testing
export { PromptLibraryServiceClass };
