/**
 * AI IPC Handlers
 *
 * Registers IPC handlers for AI operations (Ollama and ComfyUI).
 * This file only handles IPC registration and request/response adaptation.
 * Actual service communication is delegated to ollama.ts and comfyui.ts.
 */

import {ipcMain} from 'electron';
import {
    ollamaChatAsync,
    ollamaGenerateAsync,
    testOllamaConnectionAsync,
    OllamaGenerateResponse,
    OllamaMessage,
    OllamaTestResult,
} from "./ollama";
import {
    testComfyUIConnectionAsync,
    generateWithComfyUIAsync,
    getComfyUIStatusAsync,
    downloadComfyUIImageAsync,
    ensureWorkflowFilesAsync,
    fetchComfyUIImageAsBase64Async,
    ComfyUITestResult,
    ComfyUIGenerateRequest,
    ComfyUIGenerateResponse,
    ComfyUIStatusResponse,
    ComfyUIDownloadResult,
    ComfyUIWorkflowResult,
    ComfyUIWorkflowType,
    ComfyUIBase64Result,
} from "./comfyui";
import type {ToolDefinition} from "../services/ai";

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

export type { OllamaTestResult, OllamaGenerateResponse };
export type {
    ComfyUITestResult,
    ComfyUIGenerateRequest,
    ComfyUIGenerateResponse,
    ComfyUIStatusResponse,
    ComfyUIWorkflowType,
};

// ============================================================================
// IPC Interface Types
// These provide a simplified/flat API for the renderer
// ============================================================================

/**
 * Ollama generation request (IPC interface)
 * Uses flat structure for IPC convenience
 */
export interface OllamaGenerateRequest {
    baseUrl: string;
    model: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    format?: 'json';
}

/**
 * Ollama chat message (alias for OllamaMessage)
 */
export type OllamaChatMessage = OllamaMessage;

/**
 * Ollama chat request (IPC interface)
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
 * Ollama chat response (IPC interface)
 */
export interface OllamaChatResponse {
    success: boolean;
    error?: string;
    message?: OllamaChatMessage;
    done?: boolean;
}

// ============================================================================
// IPC Handler Registration
// ============================================================================

/**
 * Registers IPC handlers for AI operations
 */
export function registerAIHandlers(): void {
    // ========================================================================
    // Ollama Handlers
    // ========================================================================

    ipcMain.handle(
        'ai:ollama:test',
        async (_event, baseUrl: string): Promise<OllamaTestResult> => {
            return await testOllamaConnectionAsync(baseUrl);
        }
    );

    ipcMain.handle(
        'ai:ollama:generate',
        async (_event, request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> => {
            return await ollamaGenerateAsync({
                baseUrl: request.baseUrl,
                model: request.model,
                prompt: request.prompt,
                systemPrompt: request.systemPrompt,
                options: {
                    temperature: request.temperature,
                    maxTokens: request.maxTokens,
                    format: request.format,
                },
            }, undefined);
        }
    );

    ipcMain.handle(
        'ai:ollama:chat',
        async (_event, request: OllamaChatRequest): Promise<OllamaChatResponse> => {
            return await ollamaChatAsync({
                baseUrl: request.baseUrl,
                model: request.model,
                messages: request.messages,
                stream: false,
                tools: request.tools?.map((tool) => ({
                    type: tool.type,
                    function: {
                        name: tool.function.name,
                        description: tool.function.description,
                        parameters: tool.function.parameters,
                    }
                } as ToolDefinition)),
                options: {
                    temperature: request.options?.temperature,
                    maxTokens: request.options?.num_predict,
                },
            }, undefined);
        }
    );

    // ========================================================================
    // ComfyUI Handlers
    // ========================================================================

    ipcMain.handle(
        'ai:comfyui:test',
        async (_event, baseUrl: string): Promise<ComfyUITestResult> => {
            return await testComfyUIConnectionAsync(baseUrl);
        }
    );

    ipcMain.handle(
        'ai:comfyui:generate',
        async (_event, request: ComfyUIGenerateRequest): Promise<ComfyUIGenerateResponse> => {
            return await generateWithComfyUIAsync(request);
        }
    );

    ipcMain.handle(
        'ai:comfyui:status',
        async (_event, baseUrl: string, promptId: string): Promise<ComfyUIStatusResponse> => {
            return await getComfyUIStatusAsync(baseUrl, promptId);
        }
    );

    ipcMain.handle(
        'ai:comfyui:download',
        async (
            _event,
            baseUrl: string,
            filename: string,
            destFolder: string,
            destFilename: string
        ): Promise<ComfyUIDownloadResult> => {
            return await downloadComfyUIImageAsync(baseUrl, filename, destFolder, destFilename);
        }
    );

    ipcMain.handle(
        'ai:comfyui:ensureWorkflow',
        async (_event, projectPath: string): Promise<ComfyUIWorkflowResult> => {
            return await ensureWorkflowFilesAsync(projectPath);
        }
    );

    ipcMain.handle(
        'ai:comfyui:fetchImageBase64',
        async (
            _event,
            baseUrl: string,
            filename: string,
            subfolder?: string,
            type?: string
        ): Promise<ComfyUIBase64Result> => {
            return await fetchComfyUIImageAsBase64Async(baseUrl, filename, subfolder, type);
        }
    );
}
