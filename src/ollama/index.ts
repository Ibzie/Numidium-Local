/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LocalGemini CLI - Ollama Integration Module
 * 
 * This module provides complete Ollama integration for LocalGemini CLI,
 * replacing Google GenAI SDK with local model inference.
 */

// Core client and API
export {
  OllamaClient,
  defaultOllamaClient,
  type OllamaModel,
  type OllamaModelInfo,
  type OllamaGenerateRequest,
  type OllamaGenerateResponse,
  type OllamaError,
  type OllamaClientConfig,
} from './client.js';

// Model management
export {
  OllamaModelManager,
  defaultModelManager,
  type ModelCapabilities,
  type LocalModel,
  type ModelRecommendation,
  type HardwareRequirements,
  ModelUseCase,
  PerformanceProfile,
} from './models.js';

// Authentication and service management
export {
  OllamaAuthManager,
  defaultAuthManager,
  validateLocalAuthMethod,
  LocalAuthType,
  type OllamaAuthConfig,
  type OllamaServiceStatus,
  type OllamaConnectionInfo,
} from './auth.js';

// Content generation
export {
  OllamaContentGenerator,
  createOllamaContentGenerator,
  type OllamaContentGeneratorConfig,
} from './contentGenerator.js';

// Testing utilities
export {
  testOllamaBasicFunctionality,
} from './test.js';