/**
 * ComfyUI Service
 *
 * Handles all communication with ComfyUI for image generation.
 * This is the API repository for ComfyUI - no business logic beyond what's required for communication.
 */

import fs from 'fs/promises';
import path from 'path';
import {httpRequest, httpDownloadBinary} from "./httpUtils";

// ============================================================================
// Types
// ============================================================================

/**
 * ComfyUI workflow type
 */
export type ComfyUIWorkflowType = 'preview' | 'render';

/**
 * Result from ComfyUI connection test
 */
export interface ComfyUITestResult {
    success: boolean;
    error?: string;
    checkpoints?: string[];
}

/**
 * ComfyUI generation request
 */
export interface ComfyUIGenerateRequest {
    baseUrl: string;
    prompt: string;
    negativePrompt?: string;
    checkpointModel: string;
    steps?: number;
    width?: number;
    height?: number;
    seed?: number;
    /** Project path for loading custom workflow */
    projectPath?: string;
    /** Workflow type: 'preview' for quick 256px, 'render' for full ~512px with hi-res */
    workflowType?: ComfyUIWorkflowType;
}

/**
 * ComfyUI generation response
 */
export interface ComfyUIGenerateResponse {
    success: boolean;
    error?: string;
    promptId?: string;
}

/**
 * ComfyUI status response
 */
export interface ComfyUIStatusResponse {
    success: boolean;
    error?: string;
    status?: 'pending' | 'running' | 'completed' | 'error';
    imageFilename?: string;
    /** Subfolder for temp images (PreviewImage outputs) */
    imageSubfolder?: string;
    /** Image type: 'output' for SaveImage, 'temp' for PreviewImage */
    imageType?: 'output' | 'temp';
}

/**
 * ComfyUI image download result
 */
export interface ComfyUIDownloadResult {
    success: boolean;
    error?: string;
    savedPath?: string;
}

/**
 * ComfyUI workflow ensure result
 */
export interface ComfyUIWorkflowResult {
    success: boolean;
    created: string[];
    paths: Record<ComfyUIWorkflowType, string>;
    error?: string;
}

/**
 * ComfyUI base64 image result
 */
export interface ComfyUIBase64Result {
    success: boolean;
    base64?: string;
    error?: string;
}

// ============================================================================
// Workflow Templates
// ============================================================================

/**
 * Workflow file names
 */
const WORKFLOW_FILENAMES: Record<ComfyUIWorkflowType, string> = {
    preview: 'image-preview.comfyui',
    render: 'image-render.comfyui',
};

/**
 * Default preview workflow - uses same base dimensions as render for seed consistency
 * Uses {{width}} and {{height}} placeholders, and PreviewImage (not SaveImage)
 */
const DEFAULT_PREVIEW_WORKFLOW = {
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "{{checkpoint}}"}
    },
    "2": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "{{prompt}}", "clip": ["1", 1]}
    },
    "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "{{negative_prompt}}", "clip": ["1", 1]}
    },
    "4": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": "{{width}}", "height": "{{height}}", "batch_size": 1}
    },
    "5": {
        "class_type": "KSampler",
        "inputs": {
            "seed": "{{seed}}", "steps": "{{steps}}", "cfg": 7,
            "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]
        }
    },
    "6": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["5", 0], "vae": ["1", 2]}
    },
    "7": {
        "class_type": "PreviewImage",
        "inputs": {"images": ["6", 0]}
    }
};

const DEFAULT_RENDER_WORKFLOW = {
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "{{checkpoint}}"}
    },
    "2": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "{{prompt}}", "clip": ["1", 1]}
    },
    "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "{{negative_prompt}}", "clip": ["1", 1]}
    },
    "4": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": "{{width}}", "height": "{{height}}", "batch_size": 1}
    },
    "5": {
        "class_type": "KSampler",
        "inputs": {
            "seed": "{{seed}}", "steps": "{{steps}}", "cfg": 7,
            "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]
        }
    },
    "6": {
        "class_type": "LatentUpscaleBy",
        "inputs": {"upscale_method": "bilinear", "scale_by": 1.4, "samples": ["5", 0]}
    },
    "7": {
        "class_type": "KSampler",
        "inputs": {
            "seed": "{{seed}}", "steps": "{{steps}}", "cfg": 7,
            "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 0.6,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0]
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["7", 0], "vae": ["1", 2]}
    },
    "9": {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "ink_editor", "images": ["8", 0]}
    }
};

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Load or create workflow from project folder
 */
async function loadOrCreateWorkflow(
    projectPath: string,
    workflowType: ComfyUIWorkflowType = 'render'
): Promise<Record<string, unknown>> {
    const filename = WORKFLOW_FILENAMES[workflowType];
    const workflowPath = path.join(projectPath, filename);
    const defaultWorkflow = workflowType === 'preview' ? DEFAULT_PREVIEW_WORKFLOW : DEFAULT_RENDER_WORKFLOW;

    try {
        const content = await fs.readFile(workflowPath, 'utf-8');
        console.log(`[ComfyUI] Loaded ${workflowType} workflow from: ${workflowPath}`);
        return JSON.parse(content);
    } catch {
        console.log(`[ComfyUI] No ${workflowType} workflow found, creating default at: ${workflowPath}`);
        const defaultContent = JSON.stringify(defaultWorkflow, null, 2);
        await fs.writeFile(workflowPath, defaultContent, 'utf-8');
        return defaultWorkflow;
    }
}

/**
 * Substitute placeholders in workflow with actual values
 */
function substituteWorkflowPlaceholders(
    workflow: Record<string, unknown>,
    values: {
        prompt: string;
        negative_prompt: string;
        checkpoint: string;
        steps: number;
        width: number;
        height: number;
        seed: number;
    }
): Record<string, unknown> {
    let workflowStr = JSON.stringify(workflow);

    workflowStr = workflowStr.replace(/"\{\{prompt}}"/g, JSON.stringify(values.prompt));
    workflowStr = workflowStr.replace(/"\{\{negative_prompt}}"/g, JSON.stringify(values.negative_prompt));
    workflowStr = workflowStr.replace(/"\{\{checkpoint}}"/g, JSON.stringify(values.checkpoint));
    workflowStr = workflowStr.replace(/"\{\{steps}}"/g, String(values.steps));
    workflowStr = workflowStr.replace(/"\{\{width}}"/g, String(values.width));
    workflowStr = workflowStr.replace(/"\{\{height}}"/g, String(values.height));
    workflowStr = workflowStr.replace(/"\{\{seed}}"/g, String(values.seed));

    return JSON.parse(workflowStr);
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Test ComfyUI connection and get available checkpoints
 */
export async function testComfyUIConnectionAsync(baseUrl: string): Promise<ComfyUITestResult> {
    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        const statsResponse = await httpRequest(`${url}/system_stats`, {timeout: 5000});

        if (statsResponse.status !== 200) {
            return {
                success: false,
                error: `Server returned status ${statsResponse.status}`,
            };
        }

        const objectInfoResponse = await httpRequest(`${url}/object_info/CheckpointLoaderSimple`, {
            timeout: 10000,
        });

        let checkpoints: string[] = [];
        if (objectInfoResponse.status === 200) {
            try {
                const objectInfo = JSON.parse(objectInfoResponse.data);
                const ckptInput = objectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name;
                if (Array.isArray(ckptInput) && Array.isArray(ckptInput[0])) {
                    checkpoints = ckptInput[0];
                }
            } catch {
                // Ignore parsing errors for checkpoints
            }
        }

        return {
            success: true,
            checkpoints,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Connection failed',
        };
    }
}

/**
 * Queue image generation with ComfyUI
 */
export async function generateWithComfyUIAsync(request: ComfyUIGenerateRequest): Promise<ComfyUIGenerateResponse> {
    const requestId = Date.now().toString(36);
    const workflowType = request.workflowType || 'render';
    console.log(`[ComfyUI:${requestId}] Starting ${workflowType} image generation`);
    console.log(`[ComfyUI:${requestId}] Dimensions: ${request.width}x${request.height}`);
    console.log(`[ComfyUI:${requestId}] Seed: ${request.seed}`);
    console.log(`[ComfyUI:${requestId}] workflowType: ${request.workflowType}`);
    console.log(`[ComfyUI:${requestId}] Positive prompt: ${request.prompt}`);
    console.log(`[ComfyUI:${requestId}] Negative prompt: ${request.negativePrompt}`);
    console.log(`[ComfyUI:${requestId}] Project path: ${request.projectPath || '(none)'}`);

    try {
        const url = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

        // ComfyUI uses int64 for seeds, JS max safe integer is 2^53-1
        const seed = request.seed ?? Math.floor(Math.random() * 9007199254740991);
        const steps = request.steps ?? 20;
        const width = request.width ?? 512;
        const height = request.height ?? 512;

        // Load workflow template (custom or default)
        let workflowTemplate: Record<string, unknown>;
        if (request.projectPath) {
            workflowTemplate = await loadOrCreateWorkflow(request.projectPath, workflowType);
        } else {
            console.log(`[ComfyUI:${requestId}] No project path, using default ${workflowType} workflow`);
            workflowTemplate = workflowType === 'preview' ? DEFAULT_PREVIEW_WORKFLOW : DEFAULT_RENDER_WORKFLOW;
        }

        const workflow = substituteWorkflowPlaceholders(workflowTemplate, {
            prompt: request.prompt,
            negative_prompt: request.negativePrompt || '',
            checkpoint: request.checkpointModel,
            steps,
            width,
            height,
            seed,
        });

        console.log(`[ComfyUI:${requestId}] Workflow prepared, seed: ${seed}, steps: ${steps}, size: ${width}x${height}`);

        const payload = {
            prompt: workflow,
            client_id: 'ink_editor_' + Date.now(),
        };

        console.log(`[ComfyUI:${requestId}] Sending to ${url}/prompt`);

        const response = await httpRequest(`${url}/prompt`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
            timeout: 10000,
        });

        console.log(`[ComfyUI:${requestId}] Response status: ${response.status}`);

        if (response.status !== 200) {
            console.error(`[ComfyUI:${requestId}] Error response: ${response.data.substring(0, 500)}`);
            return {
                success: false,
                error: `Server returned status ${response.status}: ${response.data.substring(0, 200)}`,
            };
        }

        const data = JSON.parse(response.data);
        console.log(`[ComfyUI:${requestId}] Queued with prompt_id: ${data.prompt_id}`);

        return {
            success: true,
            promptId: data.prompt_id,
        };
    } catch (error) {
        console.error(`[ComfyUI:${requestId}] Error:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Generation failed',
        };
    }
}

/**
 * Check status of a ComfyUI generation
 */
export async function getComfyUIStatusAsync(
    baseUrl: string,
    promptId: string
): Promise<ComfyUIStatusResponse> {
    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        const historyResponse = await httpRequest(`${url}/history/${promptId}`, {
            timeout: 5000,
        });

        if (historyResponse.status === 200) {
            const history = JSON.parse(historyResponse.data);
            const promptHistory = history[promptId];

            if (promptHistory) {
                const outputs = promptHistory.outputs;
                if (outputs) {
                    // First pass: look for "output" type (SaveImage) - preferred for renders
                    for (const nodeId of Object.keys(outputs)) {
                        const nodeOutput = outputs[nodeId];
                        if (nodeOutput.images && nodeOutput.images.length > 0) {
                            const image = nodeOutput.images[0];
                            if (image.type === "output") {
                                return {
                                    success: true,
                                    status: 'completed',
                                    imageFilename: image.filename,
                                    imageSubfolder: image.subfolder || undefined,
                                    imageType: image.type,
                                };
                            }
                        }
                    }
                    // Second pass: look for "temp" type (PreviewImage) - fallback for previews
                    for (const nodeId of Object.keys(outputs)) {
                        const nodeOutput = outputs[nodeId];
                        if (nodeOutput.images && nodeOutput.images.length > 0) {
                            const image = nodeOutput.images[0];
                            if (image.type === "temp") {
                                return {
                                    success: true,
                                    status: 'completed',
                                    imageFilename: image.filename,
                                    imageSubfolder: image.subfolder || undefined,
                                    imageType: image.type,
                                };
                            }
                        }
                    }
                }
            }
        }

        // Check queue for pending/running status
        const queueResponse = await httpRequest(`${url}/queue`, {timeout: 5000});

        if (queueResponse.status === 200) {
            const queue = JSON.parse(queueResponse.data);

            const runningQueue = queue.queue_running || [];
            for (const item of runningQueue) {
                if (item[1] === promptId) {
                    return {
                        success: true,
                        status: 'running',
                    };
                }
            }

            const pendingQueue = queue.queue_pending || [];
            for (const item of pendingQueue) {
                if (item[1] === promptId) {
                    return {
                        success: true,
                        status: 'pending',
                    };
                }
            }
        }

        return {
            success: false,
            status: 'error',
            error: "Prompt not found in queue"
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Status check failed',
        };
    }
}

/**
 * Download a generated image from ComfyUI and save to project folder
 */
export async function downloadComfyUIImageAsync(
    baseUrl: string,
    filename: string,
    destFolder: string,
    destFilename: string
): Promise<ComfyUIDownloadResult> {
    const requestId = Date.now().toString(36);
    console.log(`[ComfyUI:${requestId}] Starting image download`);
    console.log(`[ComfyUI:${requestId}] Source filename: ${filename}`);
    console.log(`[ComfyUI:${requestId}] Destination: ${destFolder}/${destFilename}`);

    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        await fs.mkdir(destFolder, {recursive: true});
        console.log(`[ComfyUI:${requestId}] Destination folder ensured`);

        const downloadUrl = `${url}/view?filename=${encodeURIComponent(filename)}`;
        console.log(`[ComfyUI:${requestId}] Download URL: ${downloadUrl}`);

        const response = await httpDownloadBinary(downloadUrl, {timeout: 60000});

        console.log(`[ComfyUI:${requestId}] Download response status: ${response.status}`);
        console.log(`[ComfyUI:${requestId}] Content-Type: ${response.contentType}`);
        console.log(`[ComfyUI:${requestId}] Data size: ${response.data.length} bytes`);

        if (response.status !== 200) {
            console.error(`[ComfyUI:${requestId}] Download failed with status ${response.status}`);
            return {
                success: false,
                error: `Server returned status ${response.status}`,
            };
        }

        if (response.data.length === 0) {
            console.error(`[ComfyUI:${requestId}] Downloaded empty file!`);
            return {
                success: false,
                error: 'Downloaded empty file',
            };
        }

        // Verify it's a valid PNG
        const header = response.data.slice(0, 8).toString('hex');
        if (!header.startsWith('89504e47')) {
            console.error(`[ComfyUI:${requestId}] Invalid PNG header: ${header}`);
            console.error(`[ComfyUI:${requestId}] First 100 bytes as string: ${response.data.slice(0, 100).toString('utf8')}`);
            return {
                success: false,
                error: `Invalid image data received (not a PNG). Header: ${header}`,
            };
        }

        const destPath = path.join(destFolder, destFilename);
        await fs.writeFile(destPath, response.data);

        const savedStats = await fs.stat(destPath);
        console.log(`[ComfyUI:${requestId}] Saved file size: ${savedStats.size} bytes`);

        if (savedStats.size !== response.data.length) {
            console.error(`[ComfyUI:${requestId}] Size mismatch! Downloaded: ${response.data.length}, Saved: ${savedStats.size}`);
        }

        console.log(`[ComfyUI:${requestId}] Image saved successfully to: ${destPath}`);

        return {
            success: true,
            savedPath: destPath,
        };
    } catch (error) {
        console.error(`[ComfyUI:${requestId}] Download error:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Download failed',
        };
    }
}

/**
 * Ensure the ComfyUI workflow files exist in the project
 * Creates default ones if they don't exist
 */
export async function ensureWorkflowFilesAsync(
    projectPath: string
): Promise<ComfyUIWorkflowResult> {
    const paths: Record<ComfyUIWorkflowType, string> = {
        preview: path.join(projectPath, WORKFLOW_FILENAMES.preview),
        render: path.join(projectPath, WORKFLOW_FILENAMES.render),
    };
    const created: string[] = [];

    try {
        try {
            await fs.access(paths.preview);
            console.log(`[ComfyUI] Preview workflow already exists: ${paths.preview}`);
        } catch {
            console.log(`[ComfyUI] Creating default preview workflow: ${paths.preview}`);
            await fs.writeFile(paths.preview, JSON.stringify(DEFAULT_PREVIEW_WORKFLOW, null, 2), 'utf-8');
            created.push('preview');
        }

        try {
            await fs.access(paths.render);
            console.log(`[ComfyUI] Render workflow already exists: ${paths.render}`);
        } catch {
            console.log(`[ComfyUI] Creating default render workflow: ${paths.render}`);
            await fs.writeFile(paths.render, JSON.stringify(DEFAULT_RENDER_WORKFLOW, null, 2), 'utf-8');
            created.push('render');
        }

        return {success: true, created, paths};
    } catch (error) {
        console.error(`[ComfyUI] Failed to ensure workflow files:`, error);
        return {
            success: false,
            created,
            paths,
            error: error instanceof Error ? error.message : 'Failed to create workflow files',
        };
    }
}

/**
 * Fetch an image from ComfyUI and return as base64
 * Used to avoid CORS issues when fetching from renderer
 */
export async function fetchComfyUIImageAsBase64Async(
    baseUrl: string,
    filename: string,
    subfolder?: string,
    type?: string
): Promise<ComfyUIBase64Result> {
    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        let viewUrl = `${url}/view?filename=${encodeURIComponent(filename)}`;
        if (subfolder) {
            viewUrl += `&subfolder=${encodeURIComponent(subfolder)}`;
        }
        if (type) {
            viewUrl += `&type=${encodeURIComponent(type)}`;
        }

        console.log(`[ComfyUI] Fetching image as base64: ${viewUrl}`);

        const response = await httpDownloadBinary(viewUrl, {timeout: 30000});

        if (response.status !== 200) {
            return {
                success: false,
                error: `Server returned status ${response.status}`,
            };
        }

        if (response.data.length === 0) {
            return {
                success: false,
                error: 'Empty image data',
            };
        }

        const base64 = `data:${response.contentType || 'image/png'};base64,${response.data.toString('base64')}`;

        return {
            success: true,
            base64,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch image',
        };
    }
}
