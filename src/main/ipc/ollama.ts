import {httpRequest} from "./httpUtils";
import {ToolDefinition, ToolParameter} from "../services/ai";

/**
 * Ollama chat request
 */
export interface OllamaChatRequest {
    baseUrl: string;
    model: string;
    messages: OllamaMessage[];
    tools?: ToolDefinition[];
    stream?: boolean;
    options?: {
        temperature?: number;
        maxTokens?: number;
        /** Response format: 'json' for structured data, undefined for plain text */
        format?: 'json';
    };
}

/**
 * Ollama generation request
 */
export interface OllamaGenerateRequest {
    baseUrl: string;
    model: string;
    prompt: string;
    systemPrompt?: string;
    options?: {
        temperature?: number;
        maxTokens?: number;
        /** Response format: 'json' for structured data, undefined for plain text */
        format?: 'json';
    };
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
 * Ollama chat response
 */
export interface OllamaChatResponse {
    success: boolean;
    error?: string;
    message?: OllamaMessage;
    done?: boolean;
    /** JSON parse errors encountered when parsing tool calls from text */
    jsonParseErrors?: Array<{ error: string; originalJson: string }>;
}

/**
 * Result from Ollama connection test
 */
export interface OllamaTestResult {
    success: boolean;
    error?: string;
    models?: string[];
}


/**
 * Ollama message format for chat API
 */
export interface OllamaMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    /** Tool calls made by the assistant */
    tool_calls?: OllamaToolCall[];
}

/**
 * Ollama tool call
 */
export interface OllamaToolCall {
    function: {
        name: string;
        arguments: Record<string, unknown>;
    };
}

// httpRequest is imported from httpUtils.ts

// Track which models don't support tools (cached per session)
const modelsWithoutToolsSupport = new Set<string>();

const defaultTimeout = 1000 * 60 * 5; // 5 Minutes
const defaultMaxTokens = 2048;
const defaultTemperature = 0.7;

function createRequestId(): string {
    return Date.now().toString(36);
}


/**
 * Generate text using Ollama
 */
async function ollamaGenerateAsync(request: OllamaGenerateRequest, timeout: number | undefined): Promise<OllamaGenerateResponse> {
    const requestId = createRequestId();

    try {
        const url = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

        const payload = {
            model: request.model,
            prompt: request.prompt,
            system: request.systemPrompt || '',
            stream: false,
            options: {
                temperature: request.options?.temperature ?? defaultTemperature,
                num_predict: request.options?.maxTokens ?? defaultMaxTokens,
            },
            format: ""
        };

        // Only set format if explicitly requested (for structured JSON responses)
        if (request.options?.format) {
            payload.format = request.options.format;
        }

        console.log(`[Ollama:${requestId}] Sending request to ${url}/api/generate`);
        console.log(`[Ollama:${requestId}] Model: ${request.model}, Temperature: ${payload.options.temperature}, MaxTokens: ${payload.options.num_predict}`);
        console.log(`[Ollama:${requestId}] System prompt length: ${(request.systemPrompt || '').length} chars`);
        console.log(`[Ollama:${requestId}] User prompt length: ${request.prompt.length} chars`);

        const response = await httpRequest(`${url}/api/generate`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
            timeout: timeout ?? defaultTimeout,
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

        if (request.options?.format && request.options?.format == "json") {
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
 * Send a chat request to Ollama
 */
async function ollamaChatAsync(request: OllamaChatRequest, timeout: number | undefined): Promise<OllamaChatResponse> {
    const requestId = createRequestId();
    const modelKey = `${request.baseUrl}:${request.model}`;
    const useTextFallback = modelsWithoutToolsSupport.has(modelKey);
    if (useTextFallback)
        return await ollamaChatUsingTextFallbackForToolsAsync(request, requestId, timeout);

    let result = await ollamaChatUsingToolsAsync(request, requestId, timeout);
    if (!result.success && result.error) {
        // Check for various "no tools support" error patterns from Ollama
        const errorLower = result.error.toLowerCase();
        const noToolsSupport =
            errorLower.includes('does not support tools') ||
            errorLower.includes('tools are not supported') ||
            errorLower.includes('tool use is not supported') ||
            errorLower.includes('does not support tool') ||
            errorLower.includes('unknown field') && errorLower.includes('tool');

        if (noToolsSupport) {
            console.log(`[Conversation:${requestId}] Model does not support tools (from response), switching to text fallback`);
            modelsWithoutToolsSupport.add(modelKey);
            return await ollamaChatUsingTextFallbackForToolsAsync(request, requestId, timeout);
        }
    }
    return result;
}

/**
 * Send a chat request to Ollama
 */
async function ollamaChatUsingToolsAsync(request: OllamaChatRequest, requestId: string, timeout: number | undefined): Promise<OllamaChatResponse> {
    try {
        const url = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

        // If using text fallback, modify system prompt to include tool descriptions
        let messages = request.messages;
        const payload = {
            model: request.model,
            messages,
            tools: request.tools,
            stream: false,
            options: {
                temperature: request.options?.temperature ?? defaultTemperature,
                num_predict: request.options?.maxTokens ?? defaultMaxTokens,
            },
            format: ''
        };
        // Only set format if explicitly requested (for structured JSON responses)
        if (request.options?.format) {
            payload.format = request.options.format;
        }

        console.log(`[Conversation:${requestId}] Sending tools based chat request to ${url}/api/chat`);
        console.log(request);

        const response = await httpRequest(`${url}/api/chat`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
            timeout: timeout || defaultTimeout,
        });

        console.log(`[Conversation:${requestId}] Response status: ${response.status}`);
        console.log(response)

        if (response.status !== 200) {
            const errorData = response.data.substring(0, 500);
            console.error(`[Conversation:${requestId}] Error response: ${errorData}`);

            // Include the actual error message from Ollama so fallback detection works
            return {
                success: false,
                error: `Server returned status ${response.status}: ${errorData}`,
            };
        }

        const data = JSON.parse(response.data);
        console.log(`[Conversation:${requestId}] Response received, done: ${data.done}`);
        return {
            success: true,
            message: data.message,
            done: data.done,
        };
    } catch (error) {
        console.error(`[Conversation:${requestId}] Error:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Chat request failed';
        return {
            success: false,
            error: errorMessage,
        };
    }
}


function serializeTools(tools: ToolDefinition[] | undefined): string | undefined {
    if (tools === undefined)
        return undefined;

    let output = `## HOW TO CALL TOOLS

To perform ANY action, you MUST output a tool call in this EXACT format:
\`\`\`json
{ "function": "tool_name", "arguments": { "param1": "value1" } }
\`\`\`

CRITICAL RULES:
- You MUST use this JSON format to call tools
- Writing JSON data WITHOUT this format does NOTHING
- The "function" field specifies which tool to call
- The "arguments" field contains the parameters

EXAMPLE - To modify a knot named "start":
\`\`\`json
{ "function": "modify_knot", "arguments": { "name": "start", "dialogue": [{"speaker": "Sam", "text": "Hello!"}], "choices": [{"text": "Reply", "target": "reply"}] } }
\`\`\`

## Available Tools

`;
    for (let tool of tools) {
        output += `### ${tool.function.name}\n`;
        output += `${tool.function.description}\n`;

        const params = Object.entries(tool.function.parameters.properties) as [string, ToolParameter][];
        if (params.length > 0) {
            output += `Parameters:\n`;
            for (const [paramName, paramDef] of params) {
                const required = tool.function.parameters.required.includes(paramName);
                output += `  - ${paramName} (${paramDef.type}${required ? ', required' : ', optional'}): ${paramDef.description}\n`;
            }
        } else {
            output += `Parameters: none\n`;
        }
        output += `\n`;
    }

    output += `## REMEMBER
- To DO anything, you must output a tool call JSON block
- Just writing content/dialogue does NOTHING - you must call add_knot or modify_knot
- Keep all dialog short, looking like a chat message!
- Do NOT add in any narrator text, ONLY conversation.
`;
    return output;
}

/**
 * Strip JavaScript-style comments from JSON string
 * Handles: // line comments and block comments
 */
function stripJsonComments(str: string): string {
    let result = '';
    let inString = false;
    let escape = false;
    let i = 0;

    while (i < str.length) {
        const char = str[i];
        const nextChar = str[i + 1];

        if (escape) {
            result += char;
            escape = false;
            i++;
            continue;
        }

        if (char === '\\' && inString) {
            result += char;
            escape = true;
            i++;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            result += char;
            i++;
            continue;
        }

        if (inString) {
            result += char;
            i++;
            continue;
        }

        // Outside of string - check for comments
        if (char === '/' && nextChar === '/') {
            // Line comment - skip until end of line
            i += 2;
            while (i < str.length && str[i] !== '\n') {
                i++;
            }
            continue;
        }

        if (char === '/' && nextChar === '*') {
            // Block comment - skip until */
            i += 2;
            while (i < str.length - 1 && !(str[i] === '*' && str[i + 1] === '/')) {
                i++;
            }
            i += 2; // Skip */
            continue;
        }

        result += char;
        i++;
    }

    return result;
}

/**
 * Attempt to fix common JSON errors from LLM output:
 * - JavaScript comments (line and block)
 * - Unquoted property names (JavaScript object notation)
 * - Single quotes instead of double quotes
 * - Trailing commas
 */
function repairJson(str: string): string {
    // First strip comments
    str = stripJsonComments(str);

    // Fix unquoted property names: `{ text: "hello" }` -> `{ "text": "hello" }`
    // This regex finds property names that aren't quoted, followed by a colon
    // Be careful not to match inside strings
    let result = '';
    let inString = false;
    let escape = false;
    let i = 0;

    while (i < str.length) {
        const char = str[i];

        if (escape) {
            result += char;
            escape = false;
            i++;
            continue;
        }

        if (char === '\\' && inString) {
            result += char;
            escape = true;
            i++;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            result += char;
            i++;
            continue;
        }

        if (inString) {
            result += char;
            i++;
            continue;
        }

        // Outside of string - look for unquoted property names
        // Pattern: whitespace or { or , followed by identifier followed by :
        if (/[{,\s]/.test(str[i - 1] || '{') && /[a-zA-Z_$]/.test(char)) {
            // Collect the identifier
            let identifier = '';
            let j = i;
            while (j < str.length && /[a-zA-Z0-9_$]/.test(str[j])) {
                identifier += str[j];
                j++;
            }
            // Skip whitespace
            while (j < str.length && /\s/.test(str[j])) {
                j++;
            }
            // Check if followed by colon (property name)
            if (str[j] === ':') {
                result += `"${identifier}"`;
                i = j;
                continue;
            }
        }

        result += char;
        i++;
    }

    // Fix trailing commas before ] or }
    result = result.replace(/,(\s*[}\]])/g, '$1');

    return result;
}

/**
 * Result from JSON parse attempt
 */
interface JsonParseResult {
    success: boolean;
    value?: unknown;
    error?: string;
    originalJson?: string;
}

/**
 * Try to parse JSON, with repair attempt on failure
 */
function tryParseJson(str: string): JsonParseResult {
    // First try normal parse
    try {
        return { success: true, value: JSON.parse(str) };
    } catch (firstError) {
        // Try with repair
        try {
            const repaired = repairJson(str);
            return { success: true, value: JSON.parse(repaired) };
        } catch (repairError) {
            const errorMsg = (repairError as Error).message;
            console.warn('[Conversation] JSON repair failed:', errorMsg);
            return {
                success: false,
                error: errorMsg,
                originalJson: str.substring(0, 500) + (str.length > 500 ? '...' : '')
            };
        }
    }
}

/**
 * Result from deserializing tools from text
 */
interface DeserializeToolsResult {
    calls: Array<{ name: string; arguments: Record<string, unknown> }>;
    parseErrors: Array<{ error: string; originalJson: string }>;
}

function deserializeTools(text: string): DeserializeToolsResult {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const parseErrors: Array<{ error: string; originalJson: string }> = [];
    const seenCalls = new Set<string>(); // Track seen calls to avoid duplicates

    function addCall(name: string, args: Record<string, unknown>): void {
        const key = `${name}:${JSON.stringify(args)}`;
        if (!seenCalls.has(key)) {
            seenCalls.add(key);
            calls.push({name, arguments: args});
            console.log(`[Conversation] Parsed function call: ${name}`);
        }
    }

    // Helper to extract tool call from parsed JSON (supports multiple formats)
    function extractToolCall(parsed: Record<string, unknown>): boolean {
        // Format 1: { "function": "name", "arguments": {...} }
        if (parsed.function && typeof parsed.function === 'string') {
            const args = (parsed.arguments as Record<string, unknown>) || {};
            addCall(parsed.function, args);
            return true;
        }
        // Format 2: { "tool": "name", "args": [...] or {...} }
        else if (parsed.tool && typeof parsed.tool === 'string') {
            let args: Record<string, unknown> = {};
            if (Array.isArray(parsed.args)) {
                args = {_args: parsed.args};
            } else if (parsed.args && typeof parsed.args === 'object') {
                args = parsed.args as Record<string, unknown>;
            }
            addCall(parsed.tool, args);
            return true;
        }
        // Format 3: { "name": "tool_name", "arguments": {...} }
        else if (parsed.name && typeof parsed.name === 'string' && parsed.arguments) {
            const args = (parsed.arguments as Record<string, unknown>) || {};
            addCall(parsed.name, args);
            return true;
        }
        return false;
    }

    // Find balanced JSON objects by counting braces
    function findJsonObjects(str: string): string[] {
        const results: string[] = [];
        let i = 0;

        while (i < str.length) {
            if (str[i] === '{') {
                let depth = 1;
                let start = i;
                let inString = false;
                let escape = false;
                i++;

                while (i < str.length && depth > 0) {
                    const char = str[i];

                    if (escape) {
                        escape = false;
                    } else if (char === '\\' && inString) {
                        escape = true;
                    } else if (char === '"' && !escape) {
                        inString = !inString;
                    } else if (!inString) {
                        if (char === '{') depth++;
                        else if (char === '}') depth--;
                    }
                    i++;
                }

                if (depth === 0) {
                    results.push(str.substring(start, i));
                }
            } else {
                i++;
            }
        }

        return results;
    }

    // Helper to handle parse result and track errors
    function handleParseResult(result: JsonParseResult, jsonStr: string): unknown | null {
        if (result.success) {
            return result.value;
        } else if (result.error) {
            // Check if this looks like a tool call attempt (has function/tool/name keywords)
            if (jsonStr.includes('"function"') || jsonStr.includes('"tool"') || jsonStr.includes('"name"')) {
                parseErrors.push({
                    error: result.error,
                    originalJson: result.originalJson || jsonStr.substring(0, 300)
                });
            }
        }
        return null;
    }

    // Method 1: Look for JSON in code blocks (```json ... ```)
    const codeBlockPattern = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/g;
    let match;
    while ((match = codeBlockPattern.exec(text)) !== null) {
        const blockContent = match[1].trim();
        const result = tryParseJson(blockContent);
        const parsed = handleParseResult(result, blockContent);
        if (parsed && typeof parsed === 'object') {
            extractToolCall(parsed as Record<string, unknown>);
        } else if (!result.success) {
            // Try to find JSON objects within the block
            const objects = findJsonObjects(blockContent);
            for (const obj of objects) {
                const objResult = tryParseJson(obj);
                const objParsed = handleParseResult(objResult, obj);
                if (objParsed && typeof objParsed === 'object') {
                    extractToolCall(objParsed as Record<string, unknown>);
                }
            }
        }
    }

    // Method 2: Find all balanced JSON objects in the text
    const jsonObjects = findJsonObjects(text);
    for (const jsonStr of jsonObjects) {
        // Skip if it looks like it was inside a code block (already processed)
        if (text.includes('```') && text.indexOf(jsonStr) > text.indexOf('```')) {
            // Check if this JSON is between ``` markers
            const beforeJson = text.substring(0, text.indexOf(jsonStr));
            const openBlocks = (beforeJson.match(/```/g) || []).length;
            if (openBlocks % 2 === 1) continue; // Inside a code block
        }

        const result = tryParseJson(jsonStr);
        const parsed = handleParseResult(result, jsonStr);
        if (parsed && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            // Only extract if it looks like a tool call
            if (obj.function || obj.tool || (obj.name && obj.arguments)) {
                extractToolCall(obj);
            }
        }
    }

    if (calls.length > 0) {
        console.log(`[Conversation] Total function calls parsed from text: ${calls.length}`);
    } else if (text.includes('"function"') || text.includes('"tool"')) {
        console.warn('[Conversation] Text contains tool reference but no calls were parsed.');
        console.warn('[Conversation] Raw text (first 800 chars):', text.substring(0, 800));
    }

    if (parseErrors.length > 0) {
        console.warn(`[Conversation] ${parseErrors.length} JSON parse error(s) encountered`);
    }

    return { calls, parseErrors };
}

/**
 * Send a chat request to Ollama
 */
async function ollamaChatUsingTextFallbackForToolsAsync(request: OllamaChatRequest, requestId: string, timeout: number | undefined): Promise<OllamaChatResponse> {

    try {
        const url = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

        // If using text fallback, modify system prompt to include tool descriptions
        let messages = request.messages;
        if (request.tools && request.tools.length > 0) {
            let systemMessage = messages.find(e => e.role === 'system');
            if (systemMessage) {
                let index = messages.indexOf(systemMessage);
                messages[index] = {
                    role: 'system',
                    content: systemMessage.content + "\r\n" + serializeTools(request.tools),
                    tool_calls: undefined
                };
            } else {
                messages = [{
                    role: 'system',
                    content: serializeTools(request.tools) || "",
                    tool_calls: undefined
                }, ...messages];
            }
        }

        const payload = {
            model: request.model,
            messages,
            tools: undefined,
            stream: false,
            options: {
                temperature: request.options?.temperature ?? defaultTemperature,
                num_predict: request.options?.maxTokens ?? defaultMaxTokens,
            },
        };

        console.log(`[Conversation:${requestId}] Sending text-fallback based chat request to ${url}/api/chat`);
        console.log(request);

        const response = await httpRequest(`${url}/api/chat`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
            timeout: timeout || defaultTimeout,
        });

        console.log(`[Conversation:${requestId}] Response status: ${response.status}`);
        console.log(response);

        if (response.status !== 200) {
            const errorData = response.data.substring(0, 500);
            console.error(`[Conversation:${requestId}] Error response: ${errorData}`);

            return {
                success: false,
                error: `Server returned status ${response.status}`,
            };
        }

        const data = JSON.parse(response.data);
        console.log(`[Conversation:${requestId}] Response received, done: ${data.done}`);

        // If using text fallback, parse the response for function calls
        const { calls: functionCalls, parseErrors } = deserializeTools(data.message.content);
        if (functionCalls.length > 0) {
            console.log(`[Conversation:${requestId}] Parsed ${functionCalls.length} function call(s) from text`);
            // Convert to tool_calls format
            data.message.tool_calls = functionCalls.map(call => ({
                function: {
                    name: call.name,
                    arguments: call.arguments,
                },
            }));
        }

        return {
            success: true,
            message: data.message,
            done: data.done,
            jsonParseErrors: parseErrors.length > 0 ? parseErrors : undefined,
        };
    } catch (error) {
        console.error(`[Conversation:${requestId}] Error:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Chat request failed',
        };
    }
}

/**
 * Test Ollama connection and get available models
 */
async function testOllamaConnectionAsync(baseUrl: string): Promise<OllamaTestResult> {
    try {
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

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

// Export the ollama service functions
export {ollamaChatAsync, ollamaGenerateAsync, testOllamaConnectionAsync};