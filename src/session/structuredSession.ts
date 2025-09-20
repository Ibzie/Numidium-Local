/**
 * Structured Session - Following Gemini CLI Function Calling Architecture
 *
 * This session implements proper structured function calling like Gemini CLI,
 * replacing the broken natural language parsing approach.
 *
 * TODO: Tool calling system needs improvement - contributions welcome!
 */

import { Content } from '../types.js';
import { AiCliSession, SessionConfig } from './session.js';
import { OllamaApiService, ApiRequest, ApiResponse, FunctionCall } from '../api/ollamaApiService.js';
import { ToolRegistry, StructuredTool, ToolResult, ToolCallConfirmationDetails } from '../tools/toolRegistry.js';
import { ToolOrchestrator, ToolExecutionContext, ToolExecutionResult as OrchestratorResult } from '../tools/toolOrchestrator.js';
import { processAIResponse } from '../utils/responseFilter.js';
import { createSystemMessage } from '../prompts/system.js';

export interface StructuredSessionConfig extends SessionConfig {
  /** API service configuration */
  apiConfig?: {
    temperature?: number;
    timeout?: number;
    retries?: number;
  };
  /** Tool execution configuration */
  toolConfig?: {
    requireConfirmation?: boolean;
    autoExecuteTools?: boolean;
  };
}

export interface StructuredSessionResponse {
  response: string;
  toolExecutions: ToolExecutionResult[];
  modelStats?: {
    model: string;
    responseTime: number;
    tokenCount?: number;
  };
}

export interface ToolExecutionResult {
  toolName: string;
  params: Record<string, any>;
  result: ToolResult;
  executionTime: number;
  confirmed: boolean;
}

/**
 * Structured session with proper function calling following Gemini CLI patterns
 */
export class StructuredSession extends AiCliSession {
  private apiService!: OllamaApiService;
  private toolRegistry: ToolRegistry;
  private toolOrchestrator: ToolOrchestrator;
  private permissionHandler: ((request: ToolCallConfirmationDetails) => Promise<boolean>) | null = null;
  private conversationContext: number[] = [];

  constructor(config: StructuredSessionConfig, baseDirectory: string = process.cwd()) {
    super(config);
    this.toolRegistry = new ToolRegistry();
    this.toolOrchestrator = new ToolOrchestrator(this.toolRegistry);
  }

  /**
   * Initialize the session with API service and tools
   */
  async initialize(): Promise<void> {
    const config = this.config as StructuredSessionConfig;

    // Initialize API service
    this.apiService = await OllamaApiService.create({
      host: config.ollamaHost || 'http://localhost:11434',
      defaultModel: config.defaultModel,
      timeout: config.apiConfig?.timeout,
      retries: config.apiConfig?.retries,
      temperature: config.apiConfig?.temperature
    });

    // Update session state with the actual model being used (after fallback)
    const actualModel = this.apiService.getConfig().defaultModel;
    if (actualModel && actualModel !== this.getState().currentModel) {
      // Update both config and session state to reflect the fallback model
      this.config.defaultModel = actualModel;
      // Access private state to update currentModel directly
      (this as any).state.currentModel = actualModel;
    }
  }

  /**
   * Set permission handler for tool execution confirmation
   */
  setPermissionHandler(handler: (request: ToolCallConfirmationDetails) => Promise<boolean>): void {
    this.permissionHandler = handler;
    // Update orchestrator with new permission handler
    this.toolOrchestrator = new ToolOrchestrator(this.toolRegistry, handler);
  }

  /**
   * Generate response with intelligent tool calling (new enhanced version)
   */
  async generateResponseWithIntelligentTools(userInput: string): Promise<StructuredSessionResponse> {
    if (!this.apiService) {
      await this.initialize();
    }

    const startTime = performance.now();

    // Add user message to conversation
    await this.addMessage({
      role: 'user',
      parts: [{ text: userInput }]
    });

    // Create execution context
    const context: ToolExecutionContext = {
      userInput,
      workingDirectory: process.cwd(),
      availableTools: this.toolRegistry.getAllTools().map(t => t.name),
      conversationHistory: this.getState().conversationHistory.slice(-5).map(h =>
        h.parts.map(p => p.text || '[non-text]').join('')
      )
    };

    // Try intelligent tool orchestration first
    const orchestrationResult = await this.toolOrchestrator.orchestrateToolCall(context);

    if (orchestrationResult.success && orchestrationResult.result) {
      // Tool was executed successfully
      const response = this.toolOrchestrator.formatToolExecutionResponse(orchestrationResult, userInput);

      // Add AI response to conversation
      await this.addMessage({
        role: 'model',
        parts: [{ text: response }]
      });

      return {
        response,
        toolExecutions: [{
          toolName: orchestrationResult.toolCall?.name || 'unknown',
          params: orchestrationResult.toolCall?.arguments || {},
          result: orchestrationResult.result,
          executionTime: orchestrationResult.executionTime,
          confirmed: true
        }],
        modelStats: {
          model: this.getState().currentModel,
          responseTime: performance.now() - startTime
        }
      };
    }

    // Fallback to LLM-based approach if automatic detection failed
    return this.generateResponseWithTools(userInput);
  }

  /**
   * Generate response with structured function calling (legacy method)
   */
  async generateResponseWithTools(userInput: string): Promise<StructuredSessionResponse> {
    if (!this.apiService) {
      await this.initialize();
    }

    const startTime = performance.now();

    // Add user message to conversation
    await this.addMessage({
      role: 'user',
      parts: [{ text: userInput }]
    });

    // Create system prompt with tool awareness
    const systemPrompt = this.createSystemPrompt();
    
    // Get function declarations for available tools
    const functionDeclarations = this.toolRegistry.getFunctionDeclarations();

    // Create API request with function calling support
    const request: ApiRequest = {
      model: this.getState().currentModel,
      prompt: userInput,
      system: systemPrompt,
      context: this.conversationContext,
      functions: functionDeclarations,
      options: {
        temperature: 0.1,
        num_predict: 500
      }
    };

    const toolExecutions: ToolExecutionResult[] = [];
    let finalResponse = '';
    let attempts = 0;
    const maxAttempts = 5; // Prevent infinite loops

    // Main conversation loop with function calling
    while (attempts < maxAttempts) {
      attempts++;
      
      const apiResponse = await this.apiService.generateContent(request);
      this.conversationContext = apiResponse.context || [];

      console.log('API Response:', { response: apiResponse.response, function_call: apiResponse.function_call });

      // Check if AI made a function call
      if (apiResponse.function_call) {
        console.log('🔧 Function call detected, executing:', apiResponse.function_call);
        const toolExecution = await this.executeFunctionCall(apiResponse.function_call);
        console.log('🔧 Tool execution result:', toolExecution);
        toolExecutions.push(toolExecution);

        // Add function call and result to conversation context
        await this.addMessage({
          role: 'model',
          parts: [{ 
            functionCall: {
              name: apiResponse.function_call.name,
              args: apiResponse.function_call.arguments
            }
          }]
        });

        await this.addMessage({
          role: 'function',
          parts: [{ 
            functionResponse: {
              name: apiResponse.function_call.name,
              response: {
                content: toolExecution.result.content,
                success: toolExecution.result.success
              }
            }
          }]
        });

        // Continue conversation with function result
        const followupPrompt = toolExecution.result.success
          ? `User request: "${userInput}"

The ${apiResponse.function_call.name} function was executed successfully and returned:
${toolExecution.result.content}

Please provide a helpful response to the user based on their original request and the data you now have access to.`
          : `The ${apiResponse.function_call.name} function failed with error: ${toolExecution.result.error}. Please help the user understand what went wrong and suggest next steps.`;

        request.prompt = followupPrompt;
        request.functions = []; // Remove functions for follow-up to get natural response
        
        continue;
      } else {
        // AI provided a natural language response
        finalResponse = processAIResponse(apiResponse.response);
        break;
      }
    }

    // Add final AI response to conversation
    if (finalResponse) {
      await this.addMessage({
        role: 'model',
        parts: [{ text: finalResponse }]
      });
    }

    const responseTime = performance.now() - startTime;

    return {
      response: finalResponse || 'I apologize, but I encountered an issue processing your request.',
      toolExecutions,
      modelStats: {
        model: this.getState().currentModel,
        responseTime,
        tokenCount: this.conversationContext.length
      }
    };
  }

  /**
   * Execute a function call with proper validation and confirmation
   */
  private async executeFunctionCall(functionCall: FunctionCall): Promise<ToolExecutionResult> {
    const startTime = performance.now();
    
    try {
      console.log('🔧 Executing tool call:', functionCall.name, 'with args:', functionCall.arguments);
      console.log('🔧 Permission handler available:', !!this.permissionHandler);
      
      // Execute tool call through registry with permission handler
      const result = await this.toolRegistry.executeToolCall(
        functionCall.name,
        functionCall.arguments,
        this.permissionHandler || undefined
      );
      
      console.log('🔧 Tool registry returned result:', result);

      const executionTime = performance.now() - startTime;

      return {
        toolName: functionCall.name,
        params: functionCall.arguments,
        result,
        executionTime,
        confirmed: true // If we got here, it was confirmed or didn't need confirmation
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        toolName: functionCall.name,
        params: functionCall.arguments,
        result: {
          success: false,
          content: `Function execution failed: ${errorMessage}`,
          displayResult: `❌ ${functionCall.name} failed: ${errorMessage}`,
          error: errorMessage
        },
        executionTime,
        confirmed: false
      };
    }
  }

  /**
   * Create system prompt with tool awareness
   */
  private createSystemPrompt(): string {
    const toolDescriptions = this.toolRegistry.getToolDescriptions();
    
    return createSystemMessage('structured_assistant', {
      currentDirectory: process.cwd(),
      availableTools: this.toolRegistry.getAllTools().map(t => t.displayName),
      userPreferences: {
        'response_style': 'conversational_professional',
        'function_calling': true
      }
    }) + `

FUNCTION CALLING CAPABILITIES:
You have access to structured function calling for the following tools:

${toolDescriptions}

IMPORTANT FUNCTION CALLING RULES:
1. When the user requests an action that requires tool usage, make the appropriate function call
2. Always provide all required parameters for function calls
3. Use function calls for: file operations, shell commands, directory listings
4. Do NOT use function calls for: general conversation, explanations, or information requests
5. After executing functions, provide helpful context about what was accomplished

Be natural and conversational while being precise with function calls when needed.`;
  }

  /**
   * Get recent conversation context
   */
  private getRecentConversationContext(): string {
    const state = this.getState();
    const recentMessages = state.conversationHistory.slice(-6);
    
    return recentMessages
      .map(msg => `${msg.role}: ${msg.parts.map(p => p.text || '[function_call]').join('')}`)
      .join('\n');
  }

  /**
   * Switch model with API service
   */
  async switchModel(modelName: string): Promise<boolean> {
    try {
      await this.apiService.switchModel(modelName);
      
      // Update base session state
      const success = await super.switchModel(modelName);
      if (!success) {
        throw new Error(`Failed to update session model to: ${modelName}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Model switching failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    return this.getState().currentModel;
  }

  /**
   * Clear session history and context
   */
  clearHistory(): void {
    const state = this.getState();
    state.conversationHistory = [];
    state.tokenCount = 0;
    state.compactionCount = 0;
    this.conversationContext = [];
  }

  /**
   * Get API service health
   */
  async getApiHealth(): Promise<boolean> {
    return await this.apiService.checkHealth();
  }

  /**
   * Get available models from API
   */
  async getAvailableModels(): Promise<Array<{ name: string; size: number; modified_at: string }>> {
    return await this.apiService.getAvailableModels();
  }

  /**
   * Factory method for creating structured session
   */
  static async create(
    config: StructuredSessionConfig, 
    baseDirectory?: string,
    permissionHandler?: (request: ToolCallConfirmationDetails) => Promise<boolean>
  ): Promise<StructuredSession> {
    const session = new StructuredSession(config, baseDirectory);
    
    // Set permission handler before initialization
    if (permissionHandler) {
      session.setPermissionHandler(permissionHandler);
    }
    
    await session.initialize();
    return session;
  }
}