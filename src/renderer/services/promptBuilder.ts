/**
 * Prompt Builder Service
 *
 * Centralized service for building image generation prompts from character appearance data.
 * Uses shared attribute definitions from src/shared/promptData.ts.
 */

// Import shared types and data
import {
    PromptRegion,
    ShotType,
    AttributeOption,
    CharacterAppearance,
    GeneratedPrompt,
    APPEARANCE_ATTRIBUTES,
    DEFAULT_QUALITY_TAGS,
    DEFAULT_NEGATIVE_TAGS,
    DEFAULT_PORTRAIT_PROMPT,
    DEFAULT_PORTRAIT_NEGATIVE,
    DEFAULT_FULLBODY_PROMPT,
    DEFAULT_FULLBODY_NEGATIVE,
    SHOT_REGION_MAP,
    ATTRIBUTE_FIELDS,
    getAttributeOption,
    getRegionsForShot,
} from '../../shared/promptData';

// Re-export types for consumers of this module
export type {
    ShotType,
    AttributeOption,
    CharacterAppearance,
    GeneratedPrompt,
};

export {
    PromptRegion,
    APPEARANCE_ATTRIBUTES,
    DEFAULT_QUALITY_TAGS,
    DEFAULT_NEGATIVE_TAGS,
    SHOT_REGION_MAP,
};

/** Character config from .conf file */
export interface CharacterConfig {
    characterId: string;
    appearance?: CharacterAppearance;
    defaultImagePromptSet?: string;
    defaultMoodSet?: string;
    imagePromptSets?: Array<{
        name: string;
        positive: string;
        negative?: string;
    }>;
    moodSets?: Array<{
        name: string;
        description: string;
    }>;
}

/**
 * Prompt Builder Service
 *
 * Builds image generation prompts from character appearance data.
 */
class PromptBuilderService {
    /**
     * Get attribute options for a specific attribute (for UI dropdowns)
     */
    getAttributeOptions(attribute: keyof typeof APPEARANCE_ATTRIBUTES): AttributeOption[] {
        return [...APPEARANCE_ATTRIBUTES[attribute]];
    }

    /**
     * Get all attribute names
     */
    getAttributeNames(): (keyof typeof APPEARANCE_ATTRIBUTES)[] {
        return Object.keys(APPEARANCE_ATTRIBUTES) as (keyof typeof APPEARANCE_ATTRIBUTES)[];
    }

    /**
     * Get the option for a specific attribute value
     */
    getAttributeOption(attribute: keyof typeof APPEARANCE_ATTRIBUTES, value: string): AttributeOption | undefined {
        return getAttributeOption(attribute, value);
    }

    /**
     * Get default quality tags
     */
    getQualityTagOptions(): string[] {
        return [...DEFAULT_QUALITY_TAGS];
    }

    /**
     * Get default negative tags
     */
    getNegativeTagOptions(): string[] {
        return [...DEFAULT_NEGATIVE_TAGS];
    }

    /**
     * Get default appearance (for new characters)
     */
    getDefaultAppearance(): CharacterAppearance {
        return {
            // Core attributes
            gender: '',
            ageGroup: '',
            hairStyle: '',
            hairColor: '',
            eyeColor: '',
            bodyType: '',
            skinTone: '',
            artStyle: 'realistic',
            // Face details
            faceShape: '',
            noseType: '',
            lipType: '',
            eyebrowStyle: '',
            eyeShape: '',
            cheekbones: '',
            jawline: '',
            foreheadSize: '',
            chinType: '',
            // Upper body details
            shoulderWidth: '',
            armType: '',
            neckLength: '',
            // Lower body details
            hipWidth: '',
            legType: '',
            buttSize: '',
            // Accessories & details
            glasses: '',
            earrings: '',
            freckles: '',
            // Gender-specific
            facialHair: '',
            breastSize: '',
            // Tags
            qualityTags: [...DEFAULT_QUALITY_TAGS],
            additionalTags: '',
            negativeTags: [...DEFAULT_NEGATIVE_TAGS],
            additionalNegativeTags: '',
        };
    }

    /**
     * Get the regions to include for a given shot type
     */
    getRegionsForShot(shotType: ShotType): PromptRegion[] {
        return getRegionsForShot(shotType);
    }

    /**
     * Build a prompt from character appearance
     *
     * @param appearance - Character appearance data
     * @param positivePrompt - Optional positive prompt to append
     * @param negativePrompt - Optional negative prompt to append
     * @returns Generated positive and negative prompts
     */
    buildFromAppearance(
        appearance: CharacterAppearance,
        positivePrompt?: string,
        negativePrompt?: string
    ): GeneratedPrompt {
        if (!appearance) {
            throw new Error('Appearance not provided');
        }

        const positiveParts: string[] = [];
        const negativeParts: string[] = [];

        // Process each attribute (all attributes from all regions)
        for (const field of ATTRIBUTE_FIELDS) {
            const value = appearance[field as keyof CharacterAppearance] as string;
            if (value) {
                const option = this.getAttributeOption(field, value);
                if (option) {
                    if (option.positive) positiveParts.push(option.positive);
                    if (option.negative) negativeParts.push(option.negative);
                }
            }
        }

        // Quality tags
        if (appearance.qualityTags?.length) {
            positiveParts.push(...appearance.qualityTags);
        }

        // Additional positive tags
        if (appearance.additionalTags) {
            positiveParts.push(appearance.additionalTags);
        }

        // User-selected negative tags
        if (appearance.negativeTags?.length) {
            negativeParts.push(...appearance.negativeTags);
        }

        // Additional negative tags
        if (appearance.additionalNegativeTags) {
            negativeParts.push(appearance.additionalNegativeTags);
        }

        // Scene/action prompt
        if (positivePrompt) {
            positiveParts.push(positivePrompt);
        }

        if (negativePrompt) {
            negativeParts.push(negativePrompt);
        }

        return {
            positive: positiveParts.filter(Boolean).join(', '),
            negative: negativeParts.filter(Boolean).join(', ') || DEFAULT_NEGATIVE_TAGS.join(', '),
        };
    }

    /**
     * Build a prompt with regional filtering to prevent prompt bleeding
     * Only includes attributes from regions relevant to the shot type
     *
     * @param appearance - Character appearance data
     * @param shotType - Type of shot (portrait, upper_body, full_body)
     * @param additionalPositive - Optional additional positive prompt
     * @param additionalNegative - Optional additional negative prompt
     * @returns Generated positive and negative prompts
     */
    buildRegionalPrompt(
        appearance: CharacterAppearance,
        shotType: ShotType,
        additionalPositive?: string,
        additionalNegative?: string
    ): GeneratedPrompt {
        if (!appearance) {
            throw new Error('Appearance not provided');
        }

        const positiveParts: string[] = [];
        const negativeParts: string[] = [];

        // Get the regions to include for this shot type
        const includedRegions = this.getRegionsForShot(shotType);

        // Process attributes, filtering by region
        for (const field of ATTRIBUTE_FIELDS) {
            const value = appearance[field as keyof CharacterAppearance] as string;
            if (value) {
                const option = this.getAttributeOption(field, value);
                if (option && includedRegions.includes(option.region)) {
                    if (option.positive) positiveParts.push(option.positive);
                    if (option.negative) negativeParts.push(option.negative);
                }
            }
        }

        // Quality tags (always included)
        if (appearance.qualityTags?.length) {
            positiveParts.push(...appearance.qualityTags);
        }

        // Additional positive tags (user-defined, always included)
        if (appearance.additionalTags) {
            positiveParts.push(appearance.additionalTags);
        }

        // User-selected negative tags (always included)
        if (appearance.negativeTags?.length) {
            negativeParts.push(...appearance.negativeTags);
        }

        // Additional negative tags (user-defined, always included)
        if (appearance.additionalNegativeTags) {
            negativeParts.push(appearance.additionalNegativeTags);
        }

        // Additional scene/action prompts
        if (additionalPositive) {
            positiveParts.push(additionalPositive);
        }

        if (additionalNegative) {
            negativeParts.push(additionalNegative);
        }

        return {
            positive: positiveParts.filter(Boolean).join(', '),
            negative: negativeParts.filter(Boolean).join(', ') || DEFAULT_NEGATIVE_TAGS.join(', '),
        };
    }

    /**
     * Build a prompt with specific regions enabled
     * Allows granular control over which body parts to include
     *
     * @param appearance - Character appearance data
     * @param regions - Array of regions to include
     * @param additionalPositive - Optional additional positive prompt
     * @param additionalNegative - Optional additional negative prompt
     * @returns Generated positive and negative prompts
     */
    buildRegionalPromptWithRegions(
        appearance: CharacterAppearance,
        regions: PromptRegion[],
        additionalPositive?: string,
        additionalNegative?: string
    ): GeneratedPrompt {
        if (!appearance) {
            throw new Error('Appearance not provided');
        }

        if (regions.length === 0) {
            // No regions selected, return empty prompts (scenery mode)
            return { positive: '', negative: '' };
        }

        const positiveParts: string[] = [];
        const negativeParts: string[] = [];

        // Add negative prompts for excluded body regions (only if FULL_BODY/general is included)
        // This helps the model understand which parts should be out of frame
        if (regions.includes(PromptRegion.FULL_BODY)) {
            if (regions.includes(PromptRegion.HEAD)) {
                negativeParts.push('head_out_of_frame');
            }
            if (!regions.includes(PromptRegion.UPPER_BODY)) {
                negativeParts.push('upper_body');
            }
            if (!regions.includes(PromptRegion.LOWER_BODY)) {
                negativeParts.push('lower_body');
            }
        }

        // Process attributes, filtering by enabled regions
        for (const field of ATTRIBUTE_FIELDS) {
            const value = appearance[field as keyof CharacterAppearance] as string;
            if (value) {
                const option = this.getAttributeOption(field, value);
                if (option && regions.includes(option.region)) {
                    if (option.positive) positiveParts.push(option.positive);
                    if (option.negative) negativeParts.push(option.negative);
                }
            }
        }

        // Quality tags (always included when character is included)
        if (appearance.qualityTags?.length) {
            positiveParts.push(...appearance.qualityTags);
        }

        // Additional positive tags (user-defined, always included)
        if (appearance.additionalTags) {
            positiveParts.push(appearance.additionalTags);
        }

        // User-selected negative tags (always included)
        if (appearance.negativeTags?.length) {
            negativeParts.push(...appearance.negativeTags);
        }

        // Additional negative tags (user-defined, always included)
        if (appearance.additionalNegativeTags) {
            negativeParts.push(appearance.additionalNegativeTags);
        }

        // Additional scene/action prompts
        if (additionalPositive) {
            positiveParts.push(additionalPositive);
        }

        if (additionalNegative) {
            negativeParts.push(additionalNegative);
        }

        return {
            positive: positiveParts.filter(Boolean).join(', '),
            negative: negativeParts.filter(Boolean).join(', ') || DEFAULT_NEGATIVE_TAGS.join(', '),
        };
    }

    /**
     * Build a portrait prompt (convenience method with default prompt)
     */
    buildPortraitPrompt(appearance: CharacterAppearance): GeneratedPrompt {
        return this.buildFromAppearance(appearance, DEFAULT_PORTRAIT_PROMPT, DEFAULT_PORTRAIT_NEGATIVE);
    }

    /**
     * Build a full body preview prompt (for character review)
     */
    buildFullBodyPrompt(appearance: CharacterAppearance): GeneratedPrompt {
        return this.buildFromAppearance(appearance, DEFAULT_FULLBODY_PROMPT, DEFAULT_FULLBODY_NEGATIVE);
    }

    /**
     * Build a scene prompt with a specific action
     */
    buildScenePrompt(
        appearance: CharacterAppearance,
        action: string,
        setting?: string
    ): GeneratedPrompt {
        const sceneParts = [action];
        if (setting) sceneParts.push(setting);
        return this.buildFromAppearance(appearance, sceneParts.join(', '));
    }

    /**
     * Combine a base prompt with an image prompt set
     * Used when a character has specific style presets
     */
    combineWithPromptSet(
        basePrompt: GeneratedPrompt,
        promptSet: { positive: string; negative?: string }
    ): GeneratedPrompt {
        return {
            positive: [basePrompt.positive, promptSet.positive].filter(Boolean).join(', '),
            negative: [basePrompt.negative, promptSet.negative].filter(Boolean).join(', '),
        };
    }

    /**
     * Build prompt preview strings (for UI display)
     * Returns both positive and negative preview strings
     */
    buildPreview(appearance: CharacterAppearance | undefined): { positive: string; negative: string } {
        if (!appearance) {
            return {positive: '(No appearance configured)', negative: '(No appearance configured)'};
        }

        try {
            const prompt = this.buildFromAppearance(appearance);
            return {
                positive: prompt.positive || '(Empty)',
                negative: prompt.negative || '(Empty)',
            };
        } catch {
            return {positive: '(Invalid appearance)', negative: '(Invalid appearance)'};
        }
    }
}

// Export a singleton instance for app-wide use
export const promptBuilder = new PromptBuilderService();

// Also export the class for cases where a separate instance is needed
export {PromptBuilderService};
