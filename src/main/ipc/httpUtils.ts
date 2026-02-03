/**
 * HTTP Utilities
 *
 * Shared HTTP request helpers for IPC services.
 */

import http from 'http';
import https from 'https';

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
}

/**
 * HTTP response for text/JSON requests
 */
export interface HttpResponse {
    status: number;
    data: string;
}

/**
 * HTTP response for binary requests
 */
export interface HttpBinaryResponse {
    status: number;
    data: Buffer;
    contentType?: string;
}

/**
 * Default timeout for LLM API calls (2 minutes)
 */
export const DEFAULT_LLM_TIMEOUT = 120000;

/**
 * Default timeout for quick API calls (10 seconds)
 */
export const DEFAULT_QUICK_TIMEOUT = 10000;

/**
 * Default timeout for binary downloads (30 seconds)
 */
export const DEFAULT_DOWNLOAD_TIMEOUT = 30000;

/**
 * Make an HTTP request and return text/JSON response
 */
export function httpRequest(
    url: string,
    options: HttpRequestOptions = {}
): Promise<HttpResponse> {
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
            timeout: options.timeout || DEFAULT_QUICK_TIMEOUT,
        };

        const req = httpModule.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ status: res.statusCode || 0, data });
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
 * Download binary data via HTTP (for images, files, etc.)
 */
export function httpDownloadBinary(
    url: string,
    options: { timeout?: number } = {}
): Promise<HttpBinaryResponse> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const reqOptions: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            timeout: options.timeout || DEFAULT_DOWNLOAD_TIMEOUT,
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
