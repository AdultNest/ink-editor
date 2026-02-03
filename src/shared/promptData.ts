/**
 * Shared Prompt Data
 *
 * Centralized appearance attribute definitions and prompt-related types.
 * Used by both the renderer (PromptBuilder) and main process (InkToolProvider).
 */

/** Region tags for preventing prompt bleeding */
export enum PromptRegion {
    HEAD = 'head',           // Face, hair, expressions
    UPPER_BODY = 'upper_body', // Shoulders, chest, arms
    LOWER_BODY = 'lower_body', // Hips, legs
    FULL_BODY = 'full_body',   // General body type, height
}

/** Shot types for regional prompt filtering */
export type ShotType = 'portrait' | 'upper_body' | 'full_body';

/** Attribute option with tags and region */
export interface AttributeOption {
    value: string;
    label: string;
    positive: string;
    negative?: string;
    region: PromptRegion;
}

/** Character appearance attributes - stores selected option values (keys) */
export interface CharacterAppearance {
    // Core attributes
    gender: string;
    ageGroup: string;
    hairStyle: string;
    hairColor: string;
    eyeColor: string;
    bodyType: string;
    skinTone: string;
    artStyle: string;
    // Face details (HEAD region)
    faceShape: string;
    noseType: string;
    lipType: string;
    eyebrowStyle: string;
    eyeShape: string;
    cheekbones: string;
    jawline: string;
    foreheadSize: string;
    chinType: string;
    // Upper body details (UPPER_BODY region)
    shoulderWidth: string;
    armType: string;
    neckLength: string;
    // Lower body details (LOWER_BODY region)
    hipWidth: string;
    legType: string;
    buttSize: string;
    // Accessories & details
    glasses: string;
    earrings: string;
    freckles: string;
    // Gender-specific (male)
    facialHair: string;
    // Gender-specific (female)
    breastSize: string;
    // Tags
    qualityTags: string[];
    additionalTags: string;
    negativeTags: string[];
    additionalNegativeTags: string;
}

/** Generated prompt result */
export interface GeneratedPrompt {
    positive: string;
    negative: string;
}

/**
 * Centralized appearance attribute definitions
 * Each attribute has options with positive tags, optional negative tags, and region
 */
export const APPEARANCE_ATTRIBUTES = {
    gender: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.FULL_BODY},
        {value: 'male', label: 'Male', positive: '1guy, male', negative: 'female, girl, woman', region: PromptRegion.FULL_BODY},
        {value: 'female', label: 'Female', positive: '1girl, female', negative: 'male, boy, man', region: PromptRegion.FULL_BODY},
    ] as AttributeOption[],

    ageGroup: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.FULL_BODY},
        {value: 'young', label: 'Young Adult (18-25)', positive: 'young adult', negative: 'child, old, elderly, mature', region: PromptRegion.FULL_BODY},
        {value: 'adult', label: 'Adult (25-40)', positive: 'adult', negative: 'child, teen, teenager, old, elderly', region: PromptRegion.FULL_BODY},
        {value: 'mature', label: 'Mature (40+)', positive: 'mature', negative: 'child, teen, teenager, young', region: PromptRegion.FULL_BODY},
    ] as AttributeOption[],

    hairStyle: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'short', label: 'Short', positive: 'short hair', negative: 'long hair', region: PromptRegion.HEAD},
        {value: 'medium', label: 'Medium', positive: 'medium hair', negative: '', region: PromptRegion.HEAD},
        {value: 'long', label: 'Long', positive: 'long hair', negative: 'short hair', region: PromptRegion.HEAD},
        {value: 'very_long', label: 'Very Long', positive: 'very long hair', negative: 'short hair', region: PromptRegion.HEAD},
        {value: 'ponytail', label: 'Ponytail', positive: 'ponytail', negative: '', region: PromptRegion.HEAD},
        {value: 'twin_tails', label: 'Twin Tails', positive: 'twin tails', negative: '', region: PromptRegion.HEAD},
        {value: 'braid', label: 'Braid', positive: 'braid', negative: '', region: PromptRegion.HEAD},
        {value: 'bun', label: 'Bun', positive: 'hair bun', negative: '', region: PromptRegion.HEAD},
        {value: 'messy', label: 'Messy', positive: 'messy hair', negative: '', region: PromptRegion.HEAD},
        {value: 'curly', label: 'Curly', positive: 'curly hair', negative: 'straight hair', region: PromptRegion.HEAD},
        {value: 'wavy', label: 'Wavy', positive: 'wavy hair', negative: 'straight hair', region: PromptRegion.HEAD},
        {value: 'straight', label: 'Straight', positive: 'straight hair', negative: 'curly hair, wavy hair', region: PromptRegion.HEAD},
        {value: 'bald', label: 'Bald', positive: 'bald', negative: 'hair', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    hairColor: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'blonde', label: 'Blonde', positive: 'blonde hair', negative: '', region: PromptRegion.HEAD},
        {value: 'brown', label: 'Brown', positive: 'brown hair', negative: '', region: PromptRegion.HEAD},
        {value: 'black', label: 'Black', positive: 'black hair', negative: '', region: PromptRegion.HEAD},
        {value: 'red', label: 'Red', positive: 'red hair', negative: '', region: PromptRegion.HEAD},
        {value: 'ginger', label: 'Ginger', positive: 'ginger hair, orange hair', negative: '', region: PromptRegion.HEAD},
        {value: 'white', label: 'White', positive: 'white hair', negative: '', region: PromptRegion.HEAD},
        {value: 'silver', label: 'Silver', positive: 'silver hair', negative: '', region: PromptRegion.HEAD},
        {value: 'grey', label: 'Grey', positive: 'grey hair', negative: '', region: PromptRegion.HEAD},
        {value: 'blue', label: 'Blue', positive: 'blue hair', negative: '', region: PromptRegion.HEAD},
        {value: 'pink', label: 'Pink', positive: 'pink hair', negative: '', region: PromptRegion.HEAD},
        {value: 'purple', label: 'Purple', positive: 'purple hair', negative: '', region: PromptRegion.HEAD},
        {value: 'green', label: 'Green', positive: 'green hair', negative: '', region: PromptRegion.HEAD},
        {value: 'multicolored', label: 'Multicolored', positive: 'multicolored hair', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    eyeColor: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'blue', label: 'Blue', positive: 'blue eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'green', label: 'Green', positive: 'green eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'brown', label: 'Brown', positive: 'brown eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'hazel', label: 'Hazel', positive: 'hazel eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'grey', label: 'Grey', positive: 'grey eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'amber', label: 'Amber', positive: 'amber eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'red', label: 'Red', positive: 'red eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'purple', label: 'Purple', positive: 'purple eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'heterochromia', label: 'Heterochromia', positive: 'heterochromia', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    bodyType: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.FULL_BODY},
        {value: 'slim', label: 'Slim', positive: 'slim,collarbone', negative: 'fat, overweight, muscular', region: PromptRegion.FULL_BODY},
        {value: 'athletic', label: 'Athletic', positive: 'athletic, fit', negative: 'fat, overweight', region: PromptRegion.FULL_BODY},
        {value: 'average', label: 'Average', positive: 'average body', negative: '', region: PromptRegion.FULL_BODY},
        {value: 'curvy', label: 'Curvy', positive: 'curvy, (overweight:0.75)', negative: 'slim, skinny, muscular, fit, collarbone,muscles', region: PromptRegion.FULL_BODY},
        {value: 'fat', label: 'Fat', positive: '(fat:1.5), overweight', negative: 'slim, skinny, muscular, fit, collarbone,muscles', region: PromptRegion.FULL_BODY},
        {value: 'muscular', label: 'Muscular', positive: 'muscular', negative: 'slim, skinny, fat', region: PromptRegion.FULL_BODY},
        {value: 'petite', label: 'Petite', positive: 'petite', negative: 'tall, large', region: PromptRegion.FULL_BODY},
        {value: 'tall', label: 'Tall', positive: 'tall', negative: 'short, petite', region: PromptRegion.FULL_BODY},
    ] as AttributeOption[],

    skinTone: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.FULL_BODY},
        {value: 'pale', label: 'Pale', positive: 'pale skin', negative: 'dark skin, tan', region: PromptRegion.FULL_BODY},
        {value: 'fair', label: 'Fair', positive: 'fair skin', negative: 'dark skin', region: PromptRegion.FULL_BODY},
        {value: 'light', label: 'Light', positive: 'light skin', negative: 'dark skin', region: PromptRegion.FULL_BODY},
        {value: 'tan', label: 'Tan', positive: 'tan skin', negative: 'pale skin', region: PromptRegion.FULL_BODY},
        {value: 'olive', label: 'Olive', positive: 'olive skin', negative: '', region: PromptRegion.FULL_BODY},
        {value: 'brown', label: 'Brown', positive: 'brown skin', negative: 'pale skin', region: PromptRegion.FULL_BODY},
        {value: 'dark', label: 'Dark', positive: 'dark skin', negative: 'pale skin, fair skin', region: PromptRegion.FULL_BODY},
    ] as AttributeOption[],

    artStyle: [
        {value: 'realistic', label: 'Realistic', positive: 'realistic', negative: 'anime, cartoon', region: PromptRegion.FULL_BODY},
        {value: 'photorealistic', label: 'Photorealistic', positive: 'photorealistic', negative: 'anime, cartoon, drawing', region: PromptRegion.FULL_BODY},
        {value: 'semi_realistic', label: 'Semi-Realistic', positive: 'semi-realistic', negative: '', region: PromptRegion.FULL_BODY},
        {value: 'anime', label: 'Anime', positive: 'anime style', negative: 'realistic, photorealistic', region: PromptRegion.FULL_BODY},
        {value: 'digital_art', label: 'Digital Art', positive: 'digital art', negative: '', region: PromptRegion.FULL_BODY},
        {value: '3d_render', label: '3D Render', positive: '3d render', negative: '2d, flat', region: PromptRegion.FULL_BODY},
    ] as AttributeOption[],

    // Face details (HEAD region)
    faceShape: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'round', label: 'Round', positive: 'round face', negative: 'angular face', region: PromptRegion.HEAD},
        {value: 'oval', label: 'Oval', positive: 'oval face', negative: '', region: PromptRegion.HEAD},
        {value: 'square', label: 'Square', positive: 'square face', negative: 'round face', region: PromptRegion.HEAD},
        {value: 'heart', label: 'Heart', positive: 'heart-shaped face', negative: '', region: PromptRegion.HEAD},
        {value: 'diamond', label: 'Diamond', positive: 'diamond-shaped face', negative: '', region: PromptRegion.HEAD},
        {value: 'oblong', label: 'Oblong', positive: 'oblong face, long face', negative: 'round face', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    noseType: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'small', label: 'Small', positive: 'small nose', negative: 'large nose', region: PromptRegion.HEAD},
        {value: 'button', label: 'Button', positive: 'button nose', negative: '', region: PromptRegion.HEAD},
        {value: 'pointed', label: 'Pointed', positive: 'pointed nose', negative: '', region: PromptRegion.HEAD},
        {value: 'aquiline', label: 'Aquiline', positive: 'aquiline nose, roman nose', negative: '', region: PromptRegion.HEAD},
        {value: 'wide', label: 'Wide', positive: 'wide nose', negative: 'thin nose', region: PromptRegion.HEAD},
        {value: 'upturned', label: 'Upturned', positive: 'upturned nose', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    lipType: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'thin', label: 'Thin', positive: 'thin lips', negative: 'full lips', region: PromptRegion.HEAD},
        {value: 'full', label: 'Full', positive: 'full lips', negative: 'thin lips', region: PromptRegion.HEAD},
        {value: 'pouty', label: 'Pouty', positive: 'pouty lips', negative: '', region: PromptRegion.HEAD},
        {value: 'heart', label: 'Heart-shaped', positive: 'heart-shaped lips', negative: '', region: PromptRegion.HEAD},
        {value: 'wide', label: 'Wide', positive: 'wide lips', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    eyebrowStyle: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'thin', label: 'Thin', positive: 'thin eyebrows', negative: 'thick eyebrows', region: PromptRegion.HEAD},
        {value: 'thick', label: 'Thick', positive: 'thick eyebrows', negative: 'thin eyebrows', region: PromptRegion.HEAD},
        {value: 'arched', label: 'Arched', positive: 'arched eyebrows', negative: '', region: PromptRegion.HEAD},
        {value: 'straight', label: 'Straight', positive: 'straight eyebrows', negative: '', region: PromptRegion.HEAD},
        {value: 'bushy', label: 'Bushy', positive: 'bushy eyebrows', negative: '', region: PromptRegion.HEAD},
        {value: 'feathered', label: 'Feathered', positive: 'feathered eyebrows', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    eyeShape: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'round', label: 'Round', positive: 'round eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'almond', label: 'Almond', positive: 'almond eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'hooded', label: 'Hooded', positive: 'hooded eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'upturned', label: 'Upturned', positive: 'upturned eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'downturned', label: 'Downturned', positive: 'downturned eyes', negative: '', region: PromptRegion.HEAD},
        {value: 'monolid', label: 'Monolid', positive: 'monolid eyes', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    cheekbones: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'high', label: 'High', positive: 'high cheekbones', negative: '', region: PromptRegion.HEAD},
        {value: 'low', label: 'Low', positive: 'low cheekbones', negative: '', region: PromptRegion.HEAD},
        {value: 'prominent', label: 'Prominent', positive: 'prominent cheekbones', negative: '', region: PromptRegion.HEAD},
        {value: 'soft', label: 'Soft', positive: 'soft cheekbones', negative: '', region: PromptRegion.HEAD},
        {value: 'hollow', label: 'Hollow', positive: 'hollow cheeks', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    jawline: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'soft', label: 'Soft', positive: 'soft jawline', negative: 'sharp jawline', region: PromptRegion.HEAD},
        {value: 'defined', label: 'Defined', positive: 'defined jawline', negative: '', region: PromptRegion.HEAD},
        {value: 'angular', label: 'Angular', positive: 'angular jawline, sharp jawline', negative: '', region: PromptRegion.HEAD},
        {value: 'rounded', label: 'Rounded', positive: 'rounded jawline', negative: 'sharp jawline', region: PromptRegion.HEAD},
        {value: 'square', label: 'Square', positive: 'square jawline', negative: '', region: PromptRegion.HEAD},
        {value: 'v_shaped', label: 'V-shaped', positive: 'v-shaped jawline', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    foreheadSize: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'small', label: 'Small', positive: 'small forehead', negative: '', region: PromptRegion.HEAD},
        {value: 'average', label: 'Average', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'large', label: 'Large', positive: 'large forehead', negative: '', region: PromptRegion.HEAD},
        {value: 'high', label: 'High', positive: 'high forehead', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    chinType: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.HEAD},
        {value: 'pointed', label: 'Pointed', positive: 'pointed chin', negative: '', region: PromptRegion.HEAD},
        {value: 'round', label: 'Round', positive: 'round chin', negative: '', region: PromptRegion.HEAD},
        {value: 'square', label: 'Square', positive: 'square chin', negative: '', region: PromptRegion.HEAD},
        {value: 'cleft', label: 'Cleft', positive: 'cleft chin', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    // Upper body details (UPPER_BODY region)
    shoulderWidth: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'narrow', label: 'Narrow', positive: 'narrow shoulders', negative: 'broad shoulders', region: PromptRegion.UPPER_BODY},
        {value: 'average', label: 'Average', positive: '', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'broad', label: 'Broad', positive: 'broad shoulders', negative: 'narrow shoulders', region: PromptRegion.UPPER_BODY},
    ] as AttributeOption[],

    armType: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'thin', label: 'Thin', positive: 'thin arms', negative: 'muscular arms', region: PromptRegion.UPPER_BODY},
        {value: 'average', label: 'Average', positive: '', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'toned', label: 'Toned', positive: 'toned arms', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'muscular', label: 'Muscular', positive: 'muscular arms', negative: 'thin arms', region: PromptRegion.UPPER_BODY},
    ] as AttributeOption[],

    neckLength: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'short', label: 'Short', positive: 'short neck', negative: 'long neck', region: PromptRegion.UPPER_BODY},
        {value: 'average', label: 'Average', positive: '', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'long', label: 'Long', positive: 'long neck', negative: 'short neck', region: PromptRegion.UPPER_BODY},
        {value: 'swan', label: 'Swan-like', positive: 'swan neck, elegant neck', negative: '', region: PromptRegion.UPPER_BODY},
    ] as AttributeOption[],

    // Lower body details (LOWER_BODY region)
    hipWidth: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.LOWER_BODY},
        {value: 'narrow', label: 'Narrow', positive: 'narrow hips', negative: 'wide hips', region: PromptRegion.LOWER_BODY},
        {value: 'average', label: 'Average', positive: '', negative: '', region: PromptRegion.LOWER_BODY},
        {value: 'wide', label: 'Wide', positive: 'wide hips', negative: 'narrow hips', region: PromptRegion.LOWER_BODY},
        {value: 'hourglass', label: 'Hourglass', positive: 'hourglass figure, wide hips', negative: '', region: PromptRegion.LOWER_BODY},
    ] as AttributeOption[],

    legType: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.LOWER_BODY},
        {value: 'thin', label: 'Thin', positive: 'thin legs', negative: 'muscular legs', region: PromptRegion.LOWER_BODY},
        {value: 'average', label: 'Average', positive: '', negative: '', region: PromptRegion.LOWER_BODY},
        {value: 'toned', label: 'Toned', positive: 'toned legs', negative: '', region: PromptRegion.LOWER_BODY},
        {value: 'muscular', label: 'Muscular', positive: 'muscular legs', negative: 'thin legs', region: PromptRegion.LOWER_BODY},
        {value: 'long', label: 'Long', positive: 'long legs', negative: 'short legs', region: PromptRegion.LOWER_BODY},
    ] as AttributeOption[],

    buttSize: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.LOWER_BODY},
        {value: 'flat', label: 'Flat', positive: 'flat butt', negative: 'large butt', region: PromptRegion.LOWER_BODY},
        {value: 'small', label: 'Small', positive: 'small butt', negative: 'large butt', region: PromptRegion.LOWER_BODY},
        {value: 'average', label: 'Average', positive: '', negative: '', region: PromptRegion.LOWER_BODY},
        {value: 'large', label: 'Large', positive: 'large butt', negative: 'flat butt', region: PromptRegion.LOWER_BODY},
    ] as AttributeOption[],

    // Accessories & details
    glasses: [
        {value: '', label: 'None', positive: '', negative: 'glasses', region: PromptRegion.HEAD},
        {value: 'regular', label: 'Regular Glasses', positive: 'glasses', negative: '', region: PromptRegion.HEAD},
        {value: 'round', label: 'Round Glasses', positive: 'round glasses', negative: '', region: PromptRegion.HEAD},
        {value: 'square', label: 'Square Glasses', positive: 'square glasses', negative: '', region: PromptRegion.HEAD},
        {value: 'cat_eye', label: 'Cat Eye Glasses', positive: 'cat eye glasses', negative: '', region: PromptRegion.HEAD},
        {value: 'rimless', label: 'Rimless Glasses', positive: 'rimless glasses', negative: '', region: PromptRegion.HEAD},
        {value: 'half_rim', label: 'Half-Rim Glasses', positive: 'half-rim glasses', negative: '', region: PromptRegion.HEAD},
        {value: 'sunglasses', label: 'Sunglasses', positive: 'sunglasses', negative: '', region: PromptRegion.HEAD},
        {value: 'aviator', label: 'Aviator Sunglasses', positive: 'aviator sunglasses', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    earrings: [
        {value: '', label: 'None', positive: '', negative: 'earrings', region: PromptRegion.HEAD},
        {value: 'studs', label: 'Stud Earrings', positive: 'stud earrings', negative: '', region: PromptRegion.HEAD},
        {value: 'hoops', label: 'Hoop Earrings', positive: 'hoop earrings', negative: '', region: PromptRegion.HEAD},
        {value: 'hoops_large', label: 'Large Hoops', positive: 'large hoop earrings', negative: '', region: PromptRegion.HEAD},
        {value: 'dangling', label: 'Dangling Earrings', positive: 'dangling earrings', negative: '', region: PromptRegion.HEAD},
        {value: 'drop', label: 'Drop Earrings', positive: 'drop earrings', negative: '', region: PromptRegion.HEAD},
        {value: 'pearl', label: 'Pearl Earrings', positive: 'pearl earrings', negative: '', region: PromptRegion.HEAD},
        {value: 'diamond', label: 'Diamond Earrings', positive: 'diamond earrings', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    freckles: [
        {value: '', label: 'None', positive: '', negative: 'freckles', region: PromptRegion.HEAD},
        {value: 'light', label: 'Light Freckles', positive: 'light freckles', negative: '', region: PromptRegion.HEAD},
        {value: 'moderate', label: 'Moderate Freckles', positive: 'freckles', negative: '', region: PromptRegion.HEAD},
        {value: 'heavy', label: 'Heavy Freckles', positive: 'heavy freckles, many freckles', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    // Gender-specific: Male
    facialHair: [
        {value: '', label: 'None', positive: '', negative: 'beard, mustache, facial hair', region: PromptRegion.HEAD},
        {value: 'stubble', label: 'Stubble', positive: 'stubble', negative: 'beard', region: PromptRegion.HEAD},
        {value: 'light_stubble', label: 'Light Stubble', positive: 'light stubble', negative: 'beard', region: PromptRegion.HEAD},
        {value: 'goatee', label: 'Goatee', positive: 'goatee', negative: '', region: PromptRegion.HEAD},
        {value: 'mustache', label: 'Mustache', positive: 'mustache', negative: '', region: PromptRegion.HEAD},
        {value: 'short_beard', label: 'Short Beard', positive: 'short beard', negative: '', region: PromptRegion.HEAD},
        {value: 'full_beard', label: 'Full Beard', positive: 'full beard', negative: '', region: PromptRegion.HEAD},
        {value: 'long_beard', label: 'Long Beard', positive: 'long beard', negative: '', region: PromptRegion.HEAD},
        {value: 'mutton_chops', label: 'Mutton Chops', positive: 'mutton chops', negative: '', region: PromptRegion.HEAD},
    ] as AttributeOption[],

    // Gender-specific: Female
    breastSize: [
        {value: '', label: '-- Select --', positive: '', negative: '', region: PromptRegion.UPPER_BODY},
        {value: 'flat', label: 'Flat', positive: 'flat chest', negative: 'large breasts, huge breasts', region: PromptRegion.UPPER_BODY},
        {value: 'small', label: 'Small', positive: 'small breasts', negative: 'large breasts, huge breasts', region: PromptRegion.UPPER_BODY},
        {value: 'medium', label: 'Medium', positive: 'medium breasts', negative: 'flat chest, huge breasts', region: PromptRegion.UPPER_BODY},
        {value: 'large', label: 'Large', positive: 'large breasts', negative: 'flat chest, small breasts', region: PromptRegion.UPPER_BODY},
        {value: 'huge', label: 'Huge', positive: 'huge breasts', negative: 'flat chest, small breasts, medium breasts', region: PromptRegion.UPPER_BODY},
    ] as AttributeOption[],
};

/** Default quality tags */
export const DEFAULT_QUALITY_TAGS = [
    'masterpiece',
    'amazing quality',
    'newest',
    'absurdres',
    'highres',
    'highly-detailed',
    'score_9',
];

/** Default negative tags */
export const DEFAULT_NEGATIVE_TAGS = [
    'text',
    'watermark',
    'long limbs',
    'multiple fingers',
    'disfigured',
    'multiple frames',
    'multiple images',
    'rating_explicit',
    'rating_questionable',
];

/** Default portrait scene prompt */
export const DEFAULT_PORTRAIT_PROMPT = 'portrait, looking at view, neutral background, upper body, grinning, happy,';
export const DEFAULT_PORTRAIT_NEGATIVE = 'photo frame, frame, picture, zoomed in';

/** Default full body preview prompt */
export const DEFAULT_FULLBODY_PROMPT = 'full body, standing, neutral pose, simple background, studio lighting';
export const DEFAULT_FULLBODY_NEGATIVE = 'cropped, partial body, close-up, portrait';

/** Shot type to region mapping */
export const SHOT_REGION_MAP: Record<ShotType, PromptRegion[]> = {
    portrait: [PromptRegion.HEAD],
    upper_body: [PromptRegion.HEAD, PromptRegion.UPPER_BODY],
    full_body: [PromptRegion.HEAD, PromptRegion.UPPER_BODY, PromptRegion.LOWER_BODY, PromptRegion.FULL_BODY],
};

/** Extended shot type to region mapping (includes lower_body and custom) */
export const EXTENDED_SHOT_REGION_MAP: Record<string, PromptRegion[]> = {
    portrait: [PromptRegion.HEAD, PromptRegion.FULL_BODY],
    upper_body: [PromptRegion.HEAD, PromptRegion.UPPER_BODY, PromptRegion.FULL_BODY],
    lower_body: [PromptRegion.LOWER_BODY, PromptRegion.FULL_BODY],
    full_body: [PromptRegion.HEAD, PromptRegion.UPPER_BODY, PromptRegion.LOWER_BODY, PromptRegion.FULL_BODY],
};

/** List of all attribute field names */
export const ATTRIBUTE_FIELDS: (keyof typeof APPEARANCE_ATTRIBUTES)[] = [
    // Core attributes
    'gender', 'ageGroup', 'hairStyle', 'hairColor', 'eyeColor', 'bodyType', 'skinTone', 'artStyle',
    // Face details
    'faceShape', 'noseType', 'lipType', 'eyebrowStyle', 'eyeShape', 'cheekbones', 'jawline', 'foreheadSize', 'chinType',
    // Upper body details
    'shoulderWidth', 'armType', 'neckLength',
    // Lower body details
    'hipWidth', 'legType', 'buttSize',
    // Accessories
    'glasses', 'earrings', 'freckles', 'facialHair', 'breastSize'
];

/**
 * Get attribute option by attribute name and value
 */
export function getAttributeOption(
    attribute: keyof typeof APPEARANCE_ATTRIBUTES,
    value: string
): AttributeOption | undefined {
    return APPEARANCE_ATTRIBUTES[attribute].find(opt => opt.value === value);
}

/**
 * Get regions to include for a shot type
 */
export function getRegionsForShot(shotType: ShotType): PromptRegion[] {
    return SHOT_REGION_MAP[shotType] || [PromptRegion.HEAD, PromptRegion.UPPER_BODY, PromptRegion.LOWER_BODY, PromptRegion.FULL_BODY];
}
