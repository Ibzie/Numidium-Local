/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ollama Content Generator for AI-CLI
 * 
 * This module implements the ContentGenerator interface for Ollama,
 * providing local AI functionality for the AI-CLI tool.
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  FunctionCall,
  Tool,
} from '../types.js';

import { ContentGenerator, getErrorMessage } from '../interfaces.js';
import { OllamaClient, OllamaGenerateRequest, OllamaGenerateResponse } from './client.js';
import { OllamaModelManager, LocalModel } from './models.js';

export interface OllamaContentGeneratorConfig {
  model: string;
  ollamaHost?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Content generator implementation using Ollama API
 */
export class OllamaContentGenerator implements ContentGenerator {
  private client: OllamaClient;
  private modelManager: OllamaModelManager;
  private config: OllamaContentGeneratorConfig;
  private currentModel: LocalModel | null = null;

  constructor(config: OllamaContentGeneratorConfig) {
    this.config = config;
    this.client = new OllamaClient({
      host: config.ollamaHost || 'http://localhost:11434'
    });
    this.modelManager = new OllamaModelManager(this.client);
  }

  /**
   * Generate content using Ollama
   */
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    try {
      await this.ensureModelLoaded();
      
      const ollamaRequest = await this.transformToOllamaRequest(request);
      const ollamaResponse = await this.client.generate(ollamaRequest);
      
      // Update model usage statistics
      if (ollamaResponse.total_duration) {
        const responseTimeMs = ollamaResponse.total_duration / 1000000; // Convert nanoseconds to ms
        await this.modelManager.updateModelUsage(this.config.model, responseTimeMs);
      }
      
      return this.transformFromOllamaResponse(ollamaResponse, request.tools);
      
    } catch (error) {
      throw new Error(`Ollama content generation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Generate streaming content using Ollama
   */
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      await this.ensureModelLoaded();
      
      const ollamaRequest = await this.transformToOllamaRequest(request);
      const ollamaStream = this.client.generateStream(ollamaRequest);
      
      return this.transformStreamResponse(ollamaStream, request.tools);
      
    } catch (error) {
      throw new Error(`Ollama streaming generation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Count tokens (estimated for Ollama models)
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Ollama doesn't provide direct token counting, so we estimate
    // Based on average of ~3.5 characters per token for English text
    const text = this.extractTextFromContents(request.contents);
    const estimatedTokens = Math.ceil(text.length / 3.5);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  /**
   * Embed content (not supported by most Ollama models)
   */
  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Embedding is not supported by most Ollama models. Consider using a dedicated embedding service.');
  }

  /**
   * Transform Gemini request to Ollama format
   */
  private async transformToOllamaRequest(request: GenerateContentParameters): Promise<OllamaGenerateRequest> {
    const prompt = this.buildPromptFromContents(request.contents);
    
    return {
      model: this.config.model,
      prompt,
      stream: false,
      options: {
        temperature: request.generationConfig?.temperature || this.config.temperature || 0.7,
        top_p: request.generationConfig?.topP || 0.9,
        top_k: request.generationConfig?.topK || 40,
        num_predict: request.generationConfig?.maxOutputTokens || this.config.maxTokens || -1,
      }
    };
  }

  /**
   * Transform Ollama response to Gemini format
   */
  private transformFromOllamaResponse(
    ollamaResponse: OllamaGenerateResponse,
    tools?: Tool[]
  ): GenerateContentResponse {
    const parts: Part[] = [];
    
    // Check if response contains tool calls (basic pattern matching)
    if (tools && this.containsToolCall(ollamaResponse.response)) {
      const toolCall = this.extractToolCall(ollamaResponse.response);
      if (toolCall) {
        parts.push({ functionCall: toolCall });
      }
    } else {
      parts.push({ text: ollamaResponse.response });
    }

    return {
      candidates: [{
        content: {
          parts,
          role: 'model'
        },
        index: 0,
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: ollamaResponse.prompt_eval_count || 0,
        candidatesTokenCount: ollamaResponse.eval_count || 0,
        totalTokenCount: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
      }
    };
  }

  /**
   * Transform streaming Ollama responses to Gemini format
   */
  private async* transformStreamResponse(
    ollamaStream: AsyncGenerator<OllamaGenerateResponse>,
    tools?: Tool[]
  ): AsyncGenerator<GenerateContentResponse> {
    let fullResponse = '';
    
    for await (const chunk of ollamaStream) {
      fullResponse += chunk.response;
      
      const parts: Part[] = [{ text: chunk.response }];
      
      yield {
        candidates: [{
          content: {
            parts,
            role: 'model'
          },
          index: 0,
          finishReason: chunk.done ? 'STOP' : undefined
        }],
        usageMetadata: chunk.done ? {
          promptTokenCount: chunk.prompt_eval_count || 0,
          candidatesTokenCount: chunk.eval_count || 0,
          totalTokenCount: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
        } : undefined
      };
    }
  }

  /**
   * Build prompt string from Gemini content array
   */
  private buildPromptFromContents(contents: Content[]): string {
    let prompt = '';
    
    for (const content of contents) {
      if (content.role === 'user') {
        prompt += 'User: ';
      } else if (content.role === 'model') {
        prompt += 'Assistant: ';
      }
      
      for (const part of content.parts) {
        if (part.text) {
          prompt += part.text;
        } else if (part.functionCall) {
          // Format function calls for Ollama
          prompt += `[Function Call: ${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})]`;
        } else if (part.functionResponse) {
          // Format function responses for Ollama
          prompt += `[Function Response: ${JSON.stringify(part.functionResponse.response)}]`;
        }
      }
      
      prompt += '\n\n';
    }
    
    prompt += 'Assistant: ';
    return prompt;
  }

  /**
   * Extract text from content array for token counting
   */
  private extractTextFromContents(contents: Content[]): string {
    let text = '';
    
    for (const content of contents) {
      for (const part of content.parts) {
        if (part.text) {
          text += part.text + ' ';
        }
      }
    }
    
    return text;
  }

  /**
   * Check if response contains a tool call (basic pattern matching)
   */
  private containsToolCall(response: string): boolean {
    // Look for JSON-like structures that might be tool calls
    return /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{/.test(response) ||
           /\{\s*"function"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{/.test(response);
  }

  /**
   * Extract tool call from response (robust extraction with balanced brace matching)
   */
  private extractToolCall(response: string): FunctionCall | null {
    try {
      // More robust JSON extraction - find balanced braces
      let braceCount = 0;
      let start = -1;
      let end = -1;
      
      for (let i = 0; i < response.length; i++) {
        if (response[i] === '{') {
          if (start === -1) start = i;
          braceCount++;
        } else if (response[i] === '}') {
          braceCount--;
          if (braceCount === 0 && start !== -1) {
            end = i;
            break;
          }
        }
      }
      
      if (start !== -1 && end !== -1) {
        const jsonStr = response.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        
        if (parsed.name && parsed.args) {
          return {
            name: parsed.name,
            args: parsed.args
          };
        }
        
        if (parsed.function && parsed.parameters) {
          return {
            name: parsed.function,
            args: parsed.parameters
          };
        }
      }
    } catch (error) {
      // Ignore parsing errors - tool call extraction is optional
    }
    
    return null;
  }

  /**
   * Ensure the selected model is loaded and available
   */
  private async ensureModelLoaded(): Promise<void> {
    if (!this.currentModel) {
      this.currentModel = await this.modelManager.getModel(this.config.model);
      
      if (!this.currentModel) {
        throw new Error(`Model '${this.config.model}' is not available in Ollama. Please ensure it's installed.`);
      }
    }
  }
}

/**
 * Create Ollama content generator from config
 */
export function createOllamaContentGenerator(
  config: OllamaContentGeneratorConfig
): OllamaContentGenerator {
  return new OllamaContentGenerator(config);
}