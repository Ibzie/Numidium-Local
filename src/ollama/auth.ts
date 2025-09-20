/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ollama Authentication and Service Validation for LocalGemini CLI
 * 
 * This module replaces Google OAuth2 authentication with Ollama service discovery
 * and validation. Handles connection management and service health monitoring.
 */

import { OllamaClient } from './client.js';
import { OllamaModelManager } from './models.js';

export enum LocalAuthType {
  OLLAMA = 'ollama-local',
  DISABLED = 'disabled'
}

export interface OllamaAuthConfig {
  host?: string;
  timeout?: number;
  requireModel?: string;
  autoConnect?: boolean;
}

export interface OllamaServiceStatus {
  isAvailable: boolean;
  host: string;
  version?: string;
  modelCount: number;
  hasRecommendedModels: boolean;
  lastChecked: Date;
  error?: string;
}

export interface OllamaConnectionInfo {
  authType: LocalAuthType;
  serviceStatus: OllamaServiceStatus;
  selectedModel?: string;
  availableModels: string[];
}

/**
 * Recommended models for different use cases
 */
const RECOMMENDED_MODELS = {
  coding: ['qwen2.5-coder:7b', 'codellama:7b', 'deepseek-coder:6.7b'],
  general: ['mistral:7b', 'qwen2.5-coder:7b', 'phi3:3.8b'],
  lightweight: ['phi3:3.8b', 'gemma2:2b', 'qwen2.5-coder:1.5b']
};

/**
 * Ollama authentication and service manager
 */
export class OllamaAuthManager {
  private client: OllamaClient;
  private modelManager: OllamaModelManager;
  private config: OllamaAuthConfig;
  private lastStatus: OllamaServiceStatus | null = null;

  constructor(config: OllamaAuthConfig = {}) {
    this.config = {
      host: 'http://localhost:11434',
      timeout: 30000,
      autoConnect: true,
      ...config
    };
    
    this.client = new OllamaClient({
      host: this.config.host,
      timeout: this.config.timeout
    });
    
    this.modelManager = new OllamaModelManager(this.client);
  }

  /**
   * Validate Ollama service and return connection info
   */
  async validateOllamaAuth(): Promise<OllamaConnectionInfo> {
    const serviceStatus = await this.checkServiceStatus();
    const availableModels = serviceStatus.isAvailable 
      ? await this.getAvailableModelNames()
      : [];

    return {
      authType: LocalAuthType.OLLAMA,
      serviceStatus,
      availableModels,
      selectedModel: this.selectDefaultModel(availableModels)
    };
  }

  /**
   * Check Ollama service status and capabilities
   */
  async checkServiceStatus(): Promise<OllamaServiceStatus> {
    const now = new Date();
    
    try {
      const isHealthy = await this.client.checkHealth();
      
      if (!isHealthy) {
        return {
          isAvailable: false,
          host: this.config.host!,
          modelCount: 0,
          hasRecommendedModels: false,
          lastChecked: now,
          error: 'Ollama service is not responding'
        };
      }

      const models = await this.client.listModels();
      const modelNames = models.map(m => m.name);
      const hasRecommended = this.hasRecommendedModels(modelNames);

      const status: OllamaServiceStatus = {
        isAvailable: true,
        host: this.config.host!,
        modelCount: models.length,
        hasRecommendedModels: hasRecommended,
        lastChecked: now
      };

      this.lastStatus = status;
      return status;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        isAvailable: false,
        host: this.config.host!,
        modelCount: 0,
        hasRecommendedModels: false,
        lastChecked: now,
        error: errorMessage
      };
    }
  }

  /**
   * Get authentication method validation (replaces Google auth validation)
   */
  validateAuthMethod(authMethod: string): string | null {
    if (authMethod === LocalAuthType.OLLAMA) {
      // Will be validated asynchronously via validateOllamaAuth()
      return null;
    }

    if (authMethod === LocalAuthType.DISABLED) {
      return 'Local authentication is disabled. Please enable Ollama integration.';
    }

    return 'Invalid authentication method. Please use Ollama local authentication.';
  }

  /**
   * Setup Ollama service (replaces OAuth flow)
   */
  async setupOllamaService(): Promise<{ success: boolean; message: string; recommendations?: string[] }> {
    const status = await this.checkServiceStatus();
    
    if (!status.isAvailable) {
      return {
        success: false,
        message: `Ollama service not available: ${status.error || 'Unknown error'}`,
        recommendations: [
          'Install Ollama from https://ollama.ai',
          'Start Ollama service: ollama serve',
          'Verify service is running: curl http://localhost:11434'
        ]
      };
    }

    if (status.modelCount === 0) {
      return {
        success: false,
        message: 'No models available in Ollama',
        recommendations: [
          'Pull a recommended model: ollama pull qwen2.5-coder:7b',
          'Or try a lightweight model: ollama pull phi3:3.8b',
          'List available models: ollama list'
        ]
      };
    }

    if (!status.hasRecommendedModels) {
      const availableModels = await this.getAvailableModelNames();
      return {
        success: true,
        message: 'Ollama is available but no recommended models found',
        recommendations: [
          `Found models: ${availableModels.join(', ')}`,
          'Consider pulling recommended models:',
          ...RECOMMENDED_MODELS.coding.map(model => `  ollama pull ${model}`)
        ]
      };
    }

    return {
      success: true,
      message: `Ollama service ready with ${status.modelCount} models`
    };
  }

  /**
   * Get model recommendations for setup
   */
  async getSetupRecommendations(): Promise<{
    category: string;
    models: string[];
    description: string;
  }[]> {
    const recommendations = [
      {
        category: 'Coding & Development',
        models: RECOMMENDED_MODELS.coding,
        description: 'Best for code generation, debugging, and technical tasks'
      },
      {
        category: 'General Purpose',
        models: RECOMMENDED_MODELS.general,
        description: 'Good balance of capabilities for various tasks'
      },
      {
        category: 'Lightweight',
        models: RECOMMENDED_MODELS.lightweight,
        description: 'Fast responses, lower memory usage'
      }
    ];

    return recommendations;
  }

  /**
   * Refresh authentication (equivalent to token refresh)
   */
  async refreshAuth(): Promise<boolean> {
    try {
      const status = await this.checkServiceStatus();
      return status.isAvailable;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cached service status
   */
  getCachedStatus(): OllamaServiceStatus | null {
    return this.lastStatus;
  }

  /**
   * Check if a specific model is available
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const models = await this.client.listModels();
      return models.some(m => m.name === modelName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of available model names
   */
  private async getAvailableModelNames(): Promise<string[]> {
    try {
      const models = await this.client.listModels();
      return models.map(m => m.name);
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if any recommended models are available
   */
  private hasRecommendedModels(modelNames: string[]): boolean {
    const allRecommended = [
      ...RECOMMENDED_MODELS.coding,
      ...RECOMMENDED_MODELS.general,
      ...RECOMMENDED_MODELS.lightweight
    ];
    
    return modelNames.some(name => 
      allRecommended.some(recommended => 
        name.startsWith(recommended.split(':')[0])
      )
    );
  }

  /**
   * Select a default model from available options
   */
  private selectDefaultModel(availableModels: string[]): string | undefined {
    // Priority order for default selection
    const priorities = [
      ...RECOMMENDED_MODELS.coding,
      ...RECOMMENDED_MODELS.general,
      ...RECOMMENDED_MODELS.lightweight
    ];

    for (const priority of priorities) {
      const match = availableModels.find(model => 
        model.startsWith(priority.split(':')[0])
      );
      if (match) return match;
    }

    // Fallback to first available model
    return availableModels[0];
  }
}

/**
 * Default auth manager instance
 */
export const defaultAuthManager = new OllamaAuthManager();

/**
 * Validation function that replaces the original validateAuthMethod
 */
export const validateLocalAuthMethod = (authMethod: string): string | null => {
  const authManager = new OllamaAuthManager();
  return authManager.validateAuthMethod(authMethod);
};