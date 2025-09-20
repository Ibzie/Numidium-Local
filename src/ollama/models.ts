/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ollama Model Management for LocalGemini CLI
 * 
 * This module provides model discovery, metadata management, and performance optimization
 * for local Ollama models. Replaces the hardcoded Gemini model configurations.
 */

import { OllamaClient, OllamaModel, OllamaModelInfo } from './client.js';

export interface ModelCapabilities {
  maxContextLength: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  recommendedFor: ModelUseCase[];
  performanceProfile: PerformanceProfile;
}

export enum ModelUseCase {
  CODING = 'coding',
  CHAT = 'chat',
  ANALYSIS = 'analysis',
  CREATIVE = 'creative',
  TECHNICAL = 'technical',
  QUICK_TASKS = 'quick_tasks'
}

export enum PerformanceProfile {
  FAST = 'fast',
  BALANCED = 'balanced',
  QUALITY = 'quality',
  MEMORY_EFFICIENT = 'memory_efficient'
}

export interface LocalModel {
  name: string;
  displayName: string;
  size: number;
  capabilities: ModelCapabilities;
  isAvailable: boolean;
  lastUsed?: Date;
  averageResponseTime?: number;
  memoryUsage?: number;
  tags: string[];
}

export interface ModelRecommendation {
  model: LocalModel;
  score: number;
  reasoning: string;
}

export interface HardwareRequirements {
  minRam: number; // GB
  recommendedRam: number; // GB
  minVram?: number; // GB for GPU models
  estimatedResponseTime: number; // seconds
}

/**
 * Known model configurations and their capabilities
 */
const KNOWN_MODEL_CONFIGS: Record<string, Partial<ModelCapabilities>> = {
  // Code-focused models
  'codellama:7b': {
    maxContextLength: 4096,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.TECHNICAL],
    performanceProfile: PerformanceProfile.FAST
  },
  'codellama:13b': {
    maxContextLength: 4096,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.TECHNICAL],
    performanceProfile: PerformanceProfile.BALANCED
  },
  'codellama:34b': {
    maxContextLength: 4096,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.ANALYSIS],
    performanceProfile: PerformanceProfile.QUALITY
  },
  
  // Qwen models for coding
  'qwen2.5-coder:1.5b': {
    maxContextLength: 32768,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.QUICK_TASKS],
    performanceProfile: PerformanceProfile.FAST
  },
  'qwen2.5-coder:7b': {
    maxContextLength: 32768,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.TECHNICAL],
    performanceProfile: PerformanceProfile.BALANCED
  },
  'qwen2.5-coder:14b': {
    maxContextLength: 32768,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.ANALYSIS],
    performanceProfile: PerformanceProfile.QUALITY
  },
  
  // Mistral models
  'mistral:7b': {
    maxContextLength: 8192,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CHAT, ModelUseCase.TECHNICAL],
    performanceProfile: PerformanceProfile.BALANCED
  },
  'mixtral:8x7b': {
    maxContextLength: 32768,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.ANALYSIS, ModelUseCase.TECHNICAL],
    performanceProfile: PerformanceProfile.QUALITY
  },
  
  // DeepSeek models
  'deepseek-coder:6.7b': {
    maxContextLength: 16384,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.TECHNICAL],
    performanceProfile: PerformanceProfile.BALANCED
  },
  'deepseek-coder:33b': {
    maxContextLength: 16384,
    supportsTools: true,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.CODING, ModelUseCase.ANALYSIS],
    performanceProfile: PerformanceProfile.QUALITY
  },
  
  // Lightweight models
  'phi3:3.8b': {
    maxContextLength: 4096,
    supportsTools: false,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.QUICK_TASKS, ModelUseCase.CHAT],
    performanceProfile: PerformanceProfile.FAST
  },
  'gemma2:2b': {
    maxContextLength: 8192,
    supportsTools: false,
    supportsStreaming: true,
    recommendedFor: [ModelUseCase.QUICK_TASKS, ModelUseCase.CHAT],
    performanceProfile: PerformanceProfile.MEMORY_EFFICIENT
  }
};

/**
 * Hardware requirements for different model sizes
 */
const HARDWARE_REQUIREMENTS: Record<string, HardwareRequirements> = {
  '1b-3b': {
    minRam: 4,
    recommendedRam: 8,
    estimatedResponseTime: 0.5
  },
  '7b': {
    minRam: 8,
    recommendedRam: 16,
    estimatedResponseTime: 1.0
  },
  '13b-14b': {
    minRam: 16,
    recommendedRam: 32,
    estimatedResponseTime: 2.0
  },
  '30b-34b': {
    minRam: 32,
    recommendedRam: 64,
    estimatedResponseTime: 4.0
  },
  '70b+': {
    minRam: 64,
    recommendedRam: 128,
    estimatedResponseTime: 8.0
  }
};

/**
 * Model management service for LocalGemini CLI
 */
export class OllamaModelManager {
  private client: OllamaClient;
  private modelCache: Map<string, LocalModel> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly cacheTimeout = 60000; // 1 minute

  constructor(client?: OllamaClient) {
    this.client = client || new OllamaClient();
  }

  /**
   * Get all available local models
   */
  async getAvailableModels(): Promise<LocalModel[]> {
    await this.refreshModelCache();
    return Array.from(this.modelCache.values());
  }

  /**
   * Get a specific model by name
   */
  async getModel(modelName: string): Promise<LocalModel | null> {
    await this.refreshModelCache();
    return this.modelCache.get(modelName) || null;
  }

  /**
   * Get model recommendations based on use case and hardware
   */
  async getModelRecommendations(
    useCase?: ModelUseCase,
    maxMemoryGB?: number
  ): Promise<ModelRecommendation[]> {
    const models = await this.getAvailableModels();
    const recommendations: ModelRecommendation[] = [];

    for (const model of models) {
      let score = 0;
      let reasoning = '';

      // Use case matching
      if (useCase && model.capabilities.recommendedFor.includes(useCase)) {
        score += 30;
        reasoning += `Optimized for ${useCase}. `;
      }

      // Hardware compatibility
      const requirements = this.getHardwareRequirements(model);
      if (maxMemoryGB) {
        if (requirements.minRam <= maxMemoryGB) {
          score += 20;
          if (requirements.recommendedRam <= maxMemoryGB) {
            score += 10;
            reasoning += 'Meets recommended hardware requirements. ';
          } else {
            reasoning += 'Meets minimum hardware requirements. ';
          }
        } else {
          score -= 50;
          reasoning += 'May not run well on current hardware. ';
        }
      }

      // Performance profile scoring
      switch (model.capabilities.performanceProfile) {
        case PerformanceProfile.FAST:
          score += 15;
          reasoning += 'Fast response times. ';
          break;
        case PerformanceProfile.BALANCED:
          score += 20;
          reasoning += 'Good balance of speed and quality. ';
          break;
        case PerformanceProfile.QUALITY:
          score += 10;
          reasoning += 'High quality responses. ';
          break;
        case PerformanceProfile.MEMORY_EFFICIENT:
          score += 25;
          reasoning += 'Memory efficient. ';
          break;
      }

      // Recent usage bonus
      if (model.lastUsed) {
        const daysSinceUse = (Date.now() - model.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUse < 7) {
          score += 5;
          reasoning += 'Recently used. ';
        }
      }

      recommendations.push({
        model,
        score,
        reasoning: reasoning.trim()
      });
    }

    return recommendations.sort((a, b) => b.score - a.score);
  }

  /**
   * Get the best model for a specific use case
   */
  async getBestModel(useCase: ModelUseCase, maxMemoryGB?: number): Promise<LocalModel | null> {
    const recommendations = await this.getModelRecommendations(useCase, maxMemoryGB);
    return recommendations.length > 0 ? recommendations[0].model : null;
  }

  /**
   * Get hardware requirements for a model
   */
  getHardwareRequirements(model: LocalModel): HardwareRequirements {
    // Extract size category from model name or use model size
    const sizeGB = model.size / (1024 * 1024 * 1024);
    
    if (sizeGB < 4) return HARDWARE_REQUIREMENTS['1b-3b'];
    if (sizeGB < 10) return HARDWARE_REQUIREMENTS['7b'];
    if (sizeGB < 20) return HARDWARE_REQUIREMENTS['13b-14b'];
    if (sizeGB < 50) return HARDWARE_REQUIREMENTS['30b-34b'];
    return HARDWARE_REQUIREMENTS['70b+'];
  }

  /**
   * Update model usage statistics
   */
  async updateModelUsage(modelName: string, responseTime: number): Promise<void> {
    const model = await this.getModel(modelName);
    if (model) {
      model.lastUsed = new Date();
      model.averageResponseTime = model.averageResponseTime 
        ? (model.averageResponseTime + responseTime) / 2 
        : responseTime;
      
      this.modelCache.set(modelName, model);
    }
  }

  /**
   * Check if Ollama service is available
   */
  async isOllamaAvailable(): Promise<boolean> {
    return await this.client.checkHealth();
  }

  /**
   * Refresh the model cache from Ollama
   */
  private async refreshModelCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.cacheTimeout && this.modelCache.size > 0) {
      return;
    }

    try {
      const ollamaModels = await this.client.listModels();
      this.modelCache.clear();

      for (const ollamaModel of ollamaModels) {
        const localModel = await this.convertToLocalModel(ollamaModel);
        this.modelCache.set(localModel.name, localModel);
      }

      this.lastCacheUpdate = now;
    } catch (error) {
      console.warn('Failed to refresh model cache:', error);
    }
  }

  /**
   * Convert Ollama model to LocalModel with capabilities
   */
  private async convertToLocalModel(ollamaModel: OllamaModel): Promise<LocalModel> {
    const knownConfig = KNOWN_MODEL_CONFIGS[ollamaModel.name] || {};
    
    // Default capabilities for unknown models
    const defaultCapabilities: ModelCapabilities = {
      maxContextLength: 4096,
      supportsTools: false,
      supportsStreaming: true,
      recommendedFor: [ModelUseCase.CHAT],
      performanceProfile: PerformanceProfile.BALANCED
    };

    const capabilities: ModelCapabilities = {
      ...defaultCapabilities,
      ...knownConfig
    };

    return {
      name: ollamaModel.name,
      displayName: this.generateDisplayName(ollamaModel.name),
      size: ollamaModel.size,
      capabilities,
      isAvailable: true,
      tags: this.extractTags(ollamaModel.name),
    };
  }

  /**
   * Generate a human-readable display name for a model
   */
  private generateDisplayName(modelName: string): string {
    const parts = modelName.split(':');
    const baseName = parts[0];
    const tag = parts[1] || 'latest';
    
    // Convert common model names to display names
    const displayNames: Record<string, string> = {
      'codellama': 'Code Llama',
      'qwen2.5-coder': 'Qwen 2.5 Coder',
      'deepseek-coder': 'DeepSeek Coder',
      'mistral': 'Mistral',
      'mixtral': 'Mixtral',
      'phi3': 'Phi-3',
      'gemma2': 'Gemma 2'
    };

    const displayName = displayNames[baseName] || baseName;
    return tag !== 'latest' ? `${displayName} (${tag})` : displayName;
  }

  /**
   * Extract tags for categorizing models
   */
  private extractTags(modelName: string): string[] {
    const tags: string[] = [];
    const name = modelName.toLowerCase();

    if (name.includes('code') || name.includes('coder')) tags.push('coding');
    if (name.includes('chat')) tags.push('chat');
    if (name.includes('instruct')) tags.push('instruct');
    if (name.includes('1b') || name.includes('2b') || name.includes('3b')) tags.push('small');
    if (name.includes('7b') || name.includes('8b')) tags.push('medium');
    if (name.includes('13b') || name.includes('14b') || name.includes('15b')) tags.push('large');
    if (name.includes('30b') || name.includes('34b') || name.includes('70b')) tags.push('xlarge');

    return tags;
  }
}

/**
 * Default model manager instance
 */
export const defaultModelManager = new OllamaModelManager();