/**
 * Ollama API Service - Proper API Management
 * 
 * Based on Gemini CLI patterns, this creates a proper API abstraction
 * that aligns with professional coding assistant architectures.
 */

import { OllamaClient, OllamaGenerateResponse } from '../ollama/client.js';
import { OllamaModelManager } from '../ollama/models.js';
import { FunctionDeclaration } from '../tools/toolRegistry.js';

export interface ApiRequest {
  model: string;
  prompt: string;
  system?: string;
  context?: number[];
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    num_predict?: number;
  };
  stream?: boolean;
  functions?: FunctionDeclaration[];
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ApiResponse {
  response: string;
  model: string;
  created_at: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  function_call?: FunctionCall;
}

export interface ApiServiceConfig {
  host?: string;
  defaultModel?: string;
  timeout?: number;
  retries?: number;
  temperature?: number;
}

/**
 * Professional Ollama API Service following Claude Code patterns
 */
export class OllamaApiService {
  private client: OllamaClient;
  private modelManager: OllamaModelManager;
  private config: ApiServiceConfig;

  constructor(config: ApiServiceConfig = {}) {
    this.config = {
      host: config.host || 'http://localhost:11434',
      defaultModel: config.defaultModel || 'qwen3:latest',
      timeout: config.timeout || 120000,
      retries: config.retries || 3,
      temperature: config.temperature || 0.7,
      ...config
    };

    this.client = new OllamaClient({
      host: this.config.host,
      timeout: this.config.timeout,
      retries: this.config.retries
    });

    this.modelManager = new OllamaModelManager();
  }

  /**
   * Initialize the service and validate configuration
   */
  async initialize(): Promise<void> {
    const isHealthy = await this.client.checkHealth();
    if (!isHealthy) {
      throw new Error(`Ollama service not available at ${this.config.host}`);
    }

    // Get available models
    const models = await this.client.listModels();

    // Check if no models are available at all
    if (!models || models.length === 0) {
      throw new Error(`No Ollama models are available. Please install a model first by running:\n  ollama pull <model-name>\n\nPopular options: ollama pull llama3.2, ollama pull qwen2.5, ollama pull mistral`);
    }

    // Check if the preferred default model exists
    const hasDefaultModel = models.some(m => m.name === this.config.defaultModel);

    if (!hasDefaultModel) {
      // Fallback to the first available model
      const fallbackModel = models[0].name;
      console.log(`⚠️  Default model '${this.config.defaultModel}' not found. Using fallback model: '${fallbackModel}'`);
      console.log(`📋 Available models: ${models.map(m => m.name).join(', ')}`);
      this.config.defaultModel = fallbackModel;
    } else {
      console.log(`✅ Using model: '${this.config.defaultModel}'`);
    }
  }

  /**
   * Generate content with consistent API patterns and function calling support
   */
  async generateContent(request: ApiRequest): Promise<ApiResponse> {
    const startTime = performance.now();
    
    try {
      // Prepare system prompt with function calling instructions if functions are provided
      let systemPrompt = request.system || '';
      
      if (request.functions && request.functions.length > 0) {
        systemPrompt += this.createFunctionCallingPrompt(request.functions);
      }

      const ollamaRequest = {
        model: request.model || this.config.defaultModel!,
        prompt: request.prompt,
        system: systemPrompt,
        context: request.context,
        stream: false,
        options: {
          temperature: request.options?.temperature ?? this.config.temperature,
          top_p: request.options?.top_p,
          top_k: request.options?.top_k,
          repeat_penalty: request.options?.repeat_penalty,
          num_predict: request.options?.num_predict,
        }
      };

      const response = await this.client.generate(ollamaRequest);
      
      // Track model usage
      const responseTime = performance.now() - startTime;
      await this.modelManager.updateModelUsage(ollamaRequest.model, responseTime);

      // Parse function calls if present
      const transformedResponse = this.transformResponse(response);
      if (request.functions && request.functions.length > 0) {
        console.log('🔍 Checking for function calls in response:', transformedResponse.response.substring(0, 200) + '...');
        const functionCall = this.extractFunctionCall(transformedResponse.response);
        if (functionCall) {
          console.log('✅ Function call detected:', functionCall);
          transformedResponse.function_call = functionCall;
        } else {
          console.log('❌ No function call detected in response');
        }
      }

      return transformedResponse;
      
    } catch (error) {
      throw new Error(`Content generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate streaming content
   */
  async* generateContentStream(request: ApiRequest): AsyncGenerator<ApiResponse> {
    try {
      const ollamaRequest = {
        model: request.model || this.config.defaultModel!,
        prompt: request.prompt,
        system: request.system,
        context: request.context,
        stream: true,
        options: {
          temperature: request.options?.temperature ?? this.config.temperature,
          top_p: request.options?.top_p,
          top_k: request.options?.top_k,
          repeat_penalty: request.options?.repeat_penalty,
          num_predict: request.options?.num_predict,
        }
      };

      const responseStream = this.client.generateStream(ollamaRequest);
      
      for await (const chunk of responseStream) {
        yield this.transformResponse(chunk);
      }
      
    } catch (error) {
      throw new Error(`Streaming generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<Array<{ name: string; size: number; modified_at: string }>> {
    return await this.client.listModels();
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<boolean> {
    return await this.client.checkHealth();
  }

  /**
   * Get model information
   */
  async getModelInfo(modelName: string): Promise<any> {
    return await this.client.getModelInfo(modelName);
  }

  /**
   * Switch the default model
   */
  async switchModel(modelName: string): Promise<void> {
    const models = await this.getAvailableModels();
    const modelExists = models.some(m => m.name === modelName);
    
    if (!modelExists) {
      throw new Error(`Model '${modelName}' not found. Available models: ${models.map(m => m.name).join(', ')}`);
    }
    
    this.config.defaultModel = modelName;
  }

  /**
   * Get current configuration
   */
  getConfig(): ApiServiceConfig {
    return { ...this.config };
  }

  /**
   * Update service configuration
   */
  updateConfig(updates: Partial<ApiServiceConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Transform Ollama response to standard API response
   */
  private transformResponse(ollamaResponse: OllamaGenerateResponse): ApiResponse {
    return {
      response: ollamaResponse.response,
      model: ollamaResponse.model,
      created_at: ollamaResponse.created_at,
      done: ollamaResponse.done,
      context: ollamaResponse.context,
      total_duration: ollamaResponse.total_duration,
      load_duration: ollamaResponse.load_duration,
      prompt_eval_count: ollamaResponse.prompt_eval_count,
      prompt_eval_duration: ollamaResponse.prompt_eval_duration,
      eval_count: ollamaResponse.eval_count,
      eval_duration: ollamaResponse.eval_duration,
    };
  }

  /**
   * Create a conversation-aware request with system prompt
   */
  createConversationalRequest(
    userInput: string, 
    systemPrompt: string,
    conversationContext?: number[],
    options?: ApiRequest['options']
  ): ApiRequest {
    return {
      model: this.config.defaultModel!,
      prompt: userInput,
      system: systemPrompt,
      context: conversationContext,
      options: {
        temperature: this.config.temperature,
        ...options
      }
    };
  }

  /**
   * Create function calling prompt instructions
   */
  private createFunctionCallingPrompt(functions: FunctionDeclaration[]): string {
    const functionDescriptions = functions.map(fn => {
      const params = Object.entries(fn.parameters.properties)
        .map(([name, prop]) => `${name}: ${prop.description}`)
        .join(', ');
      
      return `${fn.name}(${params}) - ${fn.description}`;
    }).join('\n');

    return `

FUNCTION CALLING INSTRUCTIONS:
You have access to the following functions that you can call to perform actions:

${functionDescriptions}

When the user asks you to perform an action that requires using one of these functions, you MUST respond with ONLY this JSON format, nothing else:

{
  "function_call": {
    "name": "function_name",
    "arguments": {
      "parameter_name": "parameter_value"
    }
  }
}

CRITICAL RULES - FOLLOW EXACTLY:
1. CREATE/WRITE/SAVE file → MUST use write_file function
2. READ/SHOW/VIEW file → MUST use read_file function  
3. RUN/EXECUTE command → MUST use run_shell_command function
4. LIST/SHOW directory → MUST use list_directory function

IMPORTANT: When user wants file operations, respond with ONLY the JSON function call, NOTHING ELSE!

User: "create a file called hello.py with print hello world"
You MUST respond: {"function_call":{"name":"write_file","arguments":{"file_path":"${process.cwd()}/hello.py","content":"print('Hello, World!')"}}}

User: "make a hello world python script named charizard.py"
You MUST respond: {"function_call":{"name":"write_file","arguments":{"file_path":"${process.cwd()}/charizard.py","content":"print('Hello, World!')"}}}

NO explanations, NO code blocks, NO other text - ONLY the JSON when user wants file operations!

`;
  }

  /**
   * Extract function call from response text with robust parsing
   * TODO: Improve JSON parsing reliability - contributions welcome!
   */
  private extractFunctionCall(responseText: string): FunctionCall | null {
    try {
      let jsonContent = responseText.trim();

      // Handle markdown code blocks (```json...``` or ```...```)
      const codeBlockPatterns = [
        /```json\s*\n?([\s\S]*?)\n?```/i,
        /```\s*\n?([\s\S]*?)\n?```/i
      ];

      for (const pattern of codeBlockPatterns) {
        const match = jsonContent.match(pattern);
        if (match) {
          jsonContent = match[1].trim();
          break;
        }
      }

      // Try direct JSON parsing
      if (jsonContent.startsWith('{') && jsonContent.endsWith('}')) {
        const parsed = JSON.parse(jsonContent);
        if (parsed.function_call && parsed.function_call.name) {
          return {
            name: parsed.function_call.name,
            arguments: parsed.function_call.arguments || {}
          };
        }
      }
    } catch (error) {
      console.log('Function call extraction failed:', error instanceof Error ? error.message : String(error));
    }

    return null;
  }

  /**
   * Factory method for creating the service with health check
   */
  static async create(config: ApiServiceConfig = {}): Promise<OllamaApiService> {
    const service = new OllamaApiService(config);
    await service.initialize();
    return service;
  }
}