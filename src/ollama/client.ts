/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ollama API Client for AI-CLI
 * 
 * This module provides the core Ollama HTTP client for local AI functionality.
 * Handles communication with local Ollama service at localhost:11434.
 */

import { getErrorMessage } from '../interfaces.js';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    families?: string[];
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  modelfile: string;
  template: string;
  details: {
    families: string[];
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  context?: number[];
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaError {
  error: string;
}

export interface OllamaClientConfig {
  host?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Core Ollama HTTP client for LocalGemini CLI
 */
export class OllamaClient {
  private readonly host: string;
  private readonly timeout: number;
  private readonly retries: number;
  private isHealthy: boolean = false;
  private lastHealthCheck: number = 0;
  private readonly healthCheckInterval = 30000; // 30 seconds

  constructor(config: OllamaClientConfig = {}) {
    this.host = config.host || 'http://localhost:11434';
    this.timeout = config.timeout || 120000; // 2 minutes default
    this.retries = config.retries || 3;
  }

  /**
   * Check if Ollama service is running and healthy
   */
  async checkHealth(): Promise<boolean> {
    const now = Date.now();
    
    // Use cached health status if recent
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.isHealthy) {
      return this.isHealthy;
    }

    try {
      const response = await this.request('GET', '/');
      this.isHealthy = response.ok;
      this.lastHealthCheck = now;
      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<OllamaModel[]> {
    await this.ensureHealthy();
    
    const response = await this.request('GET', '/api/tags');
    const data = await response.json();
    
    if (!response.ok) {
      const errorData = data as OllamaError;
      throw new Error(`Failed to list models: ${errorData.error}`);
    }
    
    return (data as { models: OllamaModel[] }).models || [];
  }

  /**
   * Get detailed information about a specific model
   */
  async getModelInfo(modelName: string): Promise<OllamaModelInfo> {
    await this.ensureHealthy();
    
    const response = await this.request('POST', '/api/show', {
      name: modelName
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      const errorData = data as OllamaError;
      throw new Error(`Failed to get model info: ${errorData.error}`);
    }
    
    return data as OllamaModelInfo;
  }

  /**
   * Generate text completion
   */
  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    await this.ensureHealthy();
    
    const response = await this.request('POST', '/api/generate', {
      ...request,
      stream: false
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      const errorData = data as OllamaError;
      throw new Error(`Generation failed: ${errorData.error}`);
    }
    
    return data as OllamaGenerateResponse;
  }

  /**
   * Generate streaming text completion
   */
  async* generateStream(request: OllamaGenerateRequest): AsyncGenerator<OllamaGenerateResponse> {
    await this.ensureHealthy();
    
    const response = await this.request('POST', '/api/generate', {
      ...request,
      stream: true
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Streaming generation failed: ${(error as OllamaError).error}`);
    }
    
    if (!response.body) {
      throw new Error('No response body for streaming request');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line) as OllamaGenerateResponse;
              yield chunk;
              
              if (chunk.done) {
                return;
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming response chunk:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Pull/download a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<void> {
    await this.ensureHealthy();
    
    const response = await this.request('POST', '/api/pull', {
      name: modelName
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to pull model: ${(error as OllamaError).error}`);
    }
    
    // Note: In a full implementation, this should handle streaming progress
    // For now, we'll wait for completion
    await response.json();
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    await this.ensureHealthy();
    
    const response = await this.request('DELETE', '/api/delete', {
      name: modelName
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to delete model: ${(error as OllamaError).error}`);
    }
  }

  /**
   * Ensure Ollama service is healthy before making requests
   */
  private async ensureHealthy(): Promise<void> {
    if (!await this.checkHealth()) {
      throw new Error(
        'Ollama service is not available. Please ensure Ollama is running on ' + this.host
      );
    }
  }

  /**
   * Make HTTP request to Ollama API with retry logic
   */
  private async request(
    method: string, 
    endpoint: string, 
    body?: unknown
  ): Promise<Response> {
    const url = `${this.host}${endpoint}`;
    
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeout),
        });
        
        return response;
      } catch (error) {
        if (attempt === this.retries - 1) {
          throw new Error(
            `Ollama request failed after ${this.retries} attempts: ${getErrorMessage(error)}`
          );
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Request failed unexpectedly');
  }
}

/**
 * Default Ollama client instance
 */
export const defaultOllamaClient = new OllamaClient();