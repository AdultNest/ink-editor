import {ipcMain} from 'electron';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';

/**
 * Result from Ollama connection test
 */
export interface OllamaTestResult {
    success: boolean;
    error?: string;
    models?: string[];
}

/**
 * Result from ComfyUI connection test
 */
export interface ComfyUITestResult {
    success: boolean;
    error?: string;
    checkpoints?: string[];
}

/**
 * Ollama generation request
 */
export interface OllamaGenerateRequest {
    baseUrl: string;
    model: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    /** Response format: 'json' for structured data, undefined for plain text */
    format?: 'json';
}

/**
 * Ollama chat message
 */
export interface OllamaChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: Array<{
        function: {
            name: string;
            arguments: Record<string, unknown>;
        };
    }>;
}

/**
 * Ollama chat request
 */
export interface OllamaChatRequest {
    baseUrl: string;
    model: string;
    messages: OllamaChatMessage[];
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }>;
    stream?: boolean;
    options?: {
        temperature?: number;
        num_predict?: number;
    };
}

/**
 * Ollama chat response
 */
export interface OllamaChatResponse {
    success: boolean;
    error?: string;
    message?: OllamaChatMessage;
    done?: boolean;
}

/**
 * Ollama generation response
 */
export interface OllamaGenerateResponse {
    success: boolean;
    error?: string;
    response?: string;
}

/**
 * ComfyUI workflow type
 */
export type ComfyUIWorkflowType = 'preview' | 'render';

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
 * Helper to make HTTP requests (for text/JSON responses)
 */
function httpRequest(
    url: string,
    options: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeout?: number;
    } = {}
): Promise<{ status: number; data: string }> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const reqOptions: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.timeout || 10000,
        };

        const req = httpModule.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({status: res.statusCode || 0, data});
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

/**
 * Helper to download binary data (for images)
 */
function httpDownloadBinary(
    url: string,
    options: {
        timeout?: number;
    } = {}
): Promise<{ status: number; data: Buffer; contentType?: string }> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const reqOptions: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            timeout: options.timeout || 30000,
        };

        console.log(`[httpDownloadBinary] Requesting: ${url}`);

        const req = httpModule.request(reqOptions, (res) => {
            const chunks: Buffer[] = [];
            let totalBytes = 0;

            console.log(`[httpDownloadBinary] Response status: ${res.statusCode}`);
            console.log(`[httpDownloadBinary] Content-Type: ${res.headers['content-type']}`);
            console.log(`[httpDownloadBinary] Content-Length: ${res.headers['content-length']}`);

            res.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
                totalBytes += chunk.length;
            });

            res.on('end', () => {
                const data = Buffer.concat(chunks);
                console.log(`[httpDownloadBinary] Downloaded ${totalBytes} bytes, buffer size: ${data.length}`);

                // Verify PNG header if content-type suggests it's an image
                if (data.length >= 8) {
                    const header = data.slice(0, 8).toString('hex');
                    console.log(`[httpDownloadBinary] File header (hex): ${header}`);
                    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
                    if (header.startsWith('89504e47')) {
                        console.log(`[httpDownloadBinary] Valid PNG header detected`);
                    } else {
                        console.warn(`[httpDownloadBinary] NOT a PNG file! Header: ${header}`);
                    }
                }

                resolve({
                    status: res.statusCode || 0,
                    data,
                    contentType: res.headers['content-type'],
                });
            });
        });

        req.on('error', (err) => {
            console.error(`[httpDownloadBinary] Request error:`, err);
            reject(err);
        });

        req.on('timeout', () => {
            console.error(`[httpDownloadBinary] Request timeout`);
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

/**
 * Test Ollama connection and get available models
 */
async function testOllamaConnection(baseUrl: string): Promise<OllamaTestResult> {
    try {
        // Normalize URL
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        // Get list of models
        const response = await httpRequest(`${url}/api/tags`, {timeout: 5000});

        if (response.status !== 200) {
            return {
                success: false,
                error: `Server returned status ${response.status}`,
            };
        }

        const data = JSON.parse(response.data);
        const models = (data.models || []).map((m: { name: string }) => m.name);

        return {
            success: true,
            models,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Connection failed',
        };
    }
}

/**
 * Chat with Ollama (multi-turn with tool support)
 */
async function chatWithOllama(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    const requestId = Date.now().toString(36);

    try {
        const url = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

        const payload = {
            model: request.model,
            messages: request.messages,
            tools: request.tools,
            stream: false,
            options: request.options || {},
        };

        console.log(`[Ollama:${requestId}] Sending chat request to ${url}/api/chat`);
        console.log(`[Ollama:${requestId}] Model: ${request.model}, Messages: ${request.messages.length}, Tools: ${request.tools?.length || 0}`);

        const response = await httpRequest(`${url}/api/chat`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
            timeout: 180000, // 3 minute timeout for generation with tools
        });

        console.log(`[Ollama:${requestId}] Response status: ${response.status}`);

        if (response.status !== 200) {
            console.error(`[Ollama:${requestId}] Error response: ${response.data.substring(0, 500)}`);
            return {
                success: false,
                error: `Server returned status ${response.status}`,
            };
        }

        const data = JSON.parse(response.data);
        console.log(`[Ollama:${requestId}] Chat response received, done: ${data.done}`);

        if (data.message?.tool_calls) {
            console.log(`[Ollama:${requestId}] Tool calls: ${data.message.tool_calls.length}`);
        }

        return {
            success: true,
            message: data.message,
            done: data.done,
        };
    } catch (error) {
        console.error(`[Ollama:${requestId}] Chat request failed with error:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Chat failed',
        };
    }
}

/**
 * Generate text using Ollama
 */
async function generateWithOllama(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    const requestId = Date.now().toString(36);

    try {
        const url = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

        const payload = {
            model: request.model,
            prompt: request.prompt,
            system: request.systemPrompt || '',
            stream: false,
            options: {
                temperature: request.temperature ?? 0.7,
                num_predict: request.maxTokens ?? 2048,
            },
            format: ""
        };

        // Only set format if explicitly requested (for structured JSON responses)
        if (request.format) {
            payload.format = request.format;
        }

        console.log(`[Ollama:${requestId}] Sending request to ${url}/api/generate`);
        console.log(`[Ollama:${requestId}] Model: ${request.model}, Temperature: ${payload.options.temperature}, MaxTokens: ${payload.options.num_predict}`);
        console.log(`[Ollama:${requestId}] System prompt length: ${(request.systemPrompt || '').length} chars`);
        console.log(`[Ollama:${requestId}] User prompt length: ${request.prompt.length} chars`);

        const response = await httpRequest(`${url}/api/generate`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
            timeout: 120000, // 2 minute timeout for generation
        });

        console.log(`[Ollama:${requestId}] Response status: ${response.status}`);
        console.log(`[Ollama:${requestId}] Response length: ${response.data.length} chars`);

        if (response.status !== 200) {
            console.error(`[Ollama:${requestId}] Error response: ${response.data.substring(0, 500)}`);
            return {
                success: false,
                error: `Server returned status ${response.status}`,
            };
        }

        // Parse the Ollama API response
        let data;
        try {
            data = JSON.parse(response.data);
            console.log(`[Ollama:${requestId}] Ollama API response parsed successfully`);
        } catch (parseError) {
            console.error(`[Ollama:${requestId}] Failed to parse Ollama API response as JSON`);
            console.error(`[Ollama:${requestId}] Raw response (first 1000 chars): ${response.data.substring(0, 1000)}`);
            return {
                success: false,
                error: 'Failed to parse Ollama API response',
            };
        }

        // Log the LLM's response content
        const llmResponse = data.response || '';
        console.log(`[Ollama:${requestId}] LLM response length: ${llmResponse.length} chars`);
        console.log(`[Ollama:${requestId}] LLM response (first 500 chars): ${llmResponse.substring(0, 500)}`);

        if (request.format && request.format == "json") {
            // Check if response looks like valid JSON
            const trimmedResponse = llmResponse.trim();
            if (!trimmedResponse.startsWith('{') && !trimmedResponse.startsWith('[')) {
                console.warn(`[Ollama:${requestId}] LLM response does not start with { or [ - may not be valid JSON`);
                console.warn(`[Ollama:${requestId}] Full LLM response: ${llmResponse}`);
            }
        }

        return {
            success: true,
            response: data.response,
        };
    } catch (error) {
        console.error(`[Ollama:${requestId}] Request failed with error:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Generation failed',
        };
    }
}

/**
 * Test ComfyUI connection and get available checkpoints
 */
async function testComfyUIConnection(baseUrl: string): Promise<ComfyUITestResult> {
    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        // Check system stats to verify connection
        const statsResponse = await httpRequest(`${url}/system_stats`, {timeout: 5000});

        if (statsResponse.status !== 200) {
            return {
                success: false,
                error: `Server returned status ${statsResponse.status}`,
            };
        }

        // Get available checkpoints
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
 * Workflow file names
 */
const WORKFLOW_FILENAMES: Record<ComfyUIWorkflowType, string> = {
    preview: 'image-preview.comfyui',
    render: 'image-render.comfyui',
};

/**
 * Default workflow templates for each type
 */
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
        // Try to load existing workflow
        const content = await fs.readFile(workflowPath, 'utf-8');
        console.log(`[ComfyUI] Loaded ${workflowType} workflow from: ${workflowPath}`);
        return JSON.parse(content);
    } catch {
        // File doesn't exist, create default
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
    // Convert to string, replace placeholders, parse back
    let workflowStr = JSON.stringify(workflow);

    workflowStr = workflowStr.replace(/"\{\{prompt\}\}"/g, JSON.stringify(values.prompt));
    workflowStr = workflowStr.replace(/"\{\{negative_prompt\}\}"/g, JSON.stringify(values.negative_prompt));
    workflowStr = workflowStr.replace(/"\{\{checkpoint\}\}"/g, JSON.stringify(values.checkpoint));
    workflowStr = workflowStr.replace(/"\{\{steps\}\}"/g, String(values.steps));
    workflowStr = workflowStr.replace(/"\{\{width\}\}"/g, String(values.width));
    workflowStr = workflowStr.replace(/"\{\{height\}\}"/g, String(values.height));
    workflowStr = workflowStr.replace(/"\{\{seed\}\}"/g, String(values.seed));

    return JSON.parse(workflowStr);
}

/**
 * Queue image generation with ComfyUI
 */
async function generateWithComfyUI(request: ComfyUIGenerateRequest): Promise<ComfyUIGenerateResponse> {
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

        // Substitute placeholders
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
async function getComfyUIStatus(
    baseUrl: string,
    promptId: string
): Promise<ComfyUIStatusResponse> {
    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        // Check history for completed images
        const historyResponse = await httpRequest(`${url}/history/${promptId}`, {
            timeout: 5000,
        });

        if (historyResponse.status === 200) {
            const history = JSON.parse(historyResponse.data);
            const promptHistory = history[promptId];

            if (promptHistory) {
                // Check if there's an output image
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

            // Check running queue
            const runningQueue = queue.queue_running || [];
            for (const item of runningQueue) {
                if (item[1] === promptId) {
                    return {
                        success: true,
                        status: 'running',
                    };
                }
            }

            // Check pending queue
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

        // Not found in queue or history
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
async function downloadComfyUIImage(
    baseUrl: string,
    filename: string,
    destFolder: string,
    destFilename: string
): Promise<{ success: boolean; error?: string; savedPath?: string }> {
    const requestId = Date.now().toString(36);
    console.log(`[ComfyUI:${requestId}] Starting image download`);
    console.log(`[ComfyUI:${requestId}] Source filename: ${filename}`);
    console.log(`[ComfyUI:${requestId}] Destination: ${destFolder}/${destFilename}`);

    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        // Ensure destination folder exists
        await fs.mkdir(destFolder, {recursive: true});
        console.log(`[ComfyUI:${requestId}] Destination folder ensured`);

        // Download image using binary downloader
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

        // Save to file
        const destPath = path.join(destFolder, destFilename);
        await fs.writeFile(destPath, response.data);

        // Verify saved file
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
async function ensureWorkflowFiles(
    projectPath: string
): Promise<{ success: boolean; created: string[]; paths: Record<ComfyUIWorkflowType, string>; error?: string }> {
    const paths: Record<ComfyUIWorkflowType, string> = {
        preview: path.join(projectPath, WORKFLOW_FILENAMES.preview),
        render: path.join(projectPath, WORKFLOW_FILENAMES.render),
    };
    const created: string[] = [];

    try {
        // Check and create preview workflow
        try {
            await fs.access(paths.preview);
            console.log(`[ComfyUI] Preview workflow already exists: ${paths.preview}`);
        } catch {
            console.log(`[ComfyUI] Creating default preview workflow: ${paths.preview}`);
            await fs.writeFile(paths.preview, JSON.stringify(DEFAULT_PREVIEW_WORKFLOW, null, 2), 'utf-8');
            created.push('preview');
        }

        // Check and create render workflow
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
async function fetchComfyUIImageAsBase64(
    baseUrl: string,
    filename: string,
    subfolder?: string,
    type?: string
): Promise<{ success: boolean; base64?: string; error?: string }> {
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

        // Convert to base64
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

/**
 * Registers IPC handlers for AI operations
 */
export function registerAIHandlers(): void {
    // Test Ollama connection
    ipcMain.handle(
        'ai:ollama:test',
        async (_event, baseUrl: string): Promise<OllamaTestResult> => {
            return await testOllamaConnection(baseUrl);
        }
    );

    // Generate with Ollama
    ipcMain.handle(
        'ai:ollama:generate',
        async (_event, request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> => {
            return await generateWithOllama(request);
        }
    );

    // Chat with Ollama (multi-turn with tools)
    ipcMain.handle(
        'ai:ollama:chat',
        async (_event, request: OllamaChatRequest): Promise<OllamaChatResponse> => {
            return await chatWithOllama(request);
        }
    );

    // Test ComfyUI connection
    ipcMain.handle(
        'ai:comfyui:test',
        async (_event, baseUrl: string): Promise<ComfyUITestResult> => {
            return await testComfyUIConnection(baseUrl);
        }
    );

    // Generate with ComfyUI
    ipcMain.handle(
        'ai:comfyui:generate',
        async (_event, request: ComfyUIGenerateRequest): Promise<ComfyUIGenerateResponse> => {
            return await generateWithComfyUI(request);
        }
    );

    // Check ComfyUI generation status
    ipcMain.handle(
        'ai:comfyui:status',
        async (
            _event,
            baseUrl: string,
            promptId: string
        ): Promise<ComfyUIStatusResponse> => {
            return await getComfyUIStatus(baseUrl, promptId);
        }
    );

    // Download ComfyUI image
    ipcMain.handle(
        'ai:comfyui:download',
        async (
            _event,
            baseUrl: string,
            filename: string,
            destFolder: string,
            destFilename: string
        ): Promise<{ success: boolean; error?: string; savedPath?: string }> => {
            return await downloadComfyUIImage(baseUrl, filename, destFolder, destFilename);
        }
    );

    // Ensure ComfyUI workflow files exist
    ipcMain.handle(
        'ai:comfyui:ensureWorkflow',
        async (
            _event,
            projectPath: string
        ): Promise<{
            success: boolean;
            created: string[];
            paths: Record<ComfyUIWorkflowType, string>;
            error?: string
        }> => {
            return await ensureWorkflowFiles(projectPath);
        }
    );

    // Fetch ComfyUI image as base64 (avoids CORS issues)
    ipcMain.handle(
        'ai:comfyui:fetchImageBase64',
        async (
            _event,
            baseUrl: string,
            filename: string,
            subfolder?: string,
            type?: string
        ): Promise<{ success: boolean; base64?: string; error?: string }> => {
            return await fetchComfyUIImageAsBase64(baseUrl, filename, subfolder, type);
        }
    );
}
