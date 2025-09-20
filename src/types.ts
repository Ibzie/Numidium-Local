/**
 * Type definitions for AI-CLI
 * 
 * Standalone type definitions that don't depend on external libraries
 */

export interface Content {
  role: 'user' | 'model' | 'function';
  parts: Part[];
}

export interface Part {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
}

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface FunctionResponse {
  name: string;
  response: unknown;
}

export interface Tool {
  functionDeclarations: FunctionDeclaration[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface GenerateContentParameters {
  contents: Content[];
  tools?: Tool[];
  generationConfig?: GenerationConfig;
}

export interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
}

export interface GenerateContentResponse {
  candidates: Candidate[];
  usageMetadata?: UsageMetadata;
}

export interface Candidate {
  content: Content;
  index: number;
  finishReason?: string;
}

export interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface CountTokensParameters {
  contents: Content[];
}

export interface CountTokensResponse {
  totalTokens: number;
}

export interface EmbedContentParameters {
  content: Content;
}

export interface EmbedContentResponse {
  embedding: number[];
}