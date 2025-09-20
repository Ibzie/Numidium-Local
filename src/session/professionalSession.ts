/**
 * Professional AI Session - Based on Claude Code Architecture
 * 
 * Replaces the hardcoded response system with proper API management
 * following professional coding assistant patterns.
 */

import { Content } from '../types.js';
import { AiCliSession, SessionConfig } from './session.js';
import { OllamaApiService, ApiRequest, ApiResponse } from '../api/ollamaApiService.js';
import { ToolRegistry } from '../tools/geminiStyleTools.js';
import { RouterToolService } from '../routing/routerIntegration.js';
import { LocalToolRouter } from '../routing/localRouter.js';
import { processAIResponse } from '../utils/responseFilter.js';
import { createSystemMessage } from '../prompts/system.js';

export interface ProfessionalSessionConfig extends SessionConfig {
  /** API service configuration */
  apiConfig?: {
    temperature?: number;
    timeout?: number;
    retries?: number;
  };
  /** Tool execution configuration */
  toolConfig?: {
    enablePatternRouting?: boolean;
    enableClassificationRouting?: boolean;
    toolExecutionThreshold?: number;
  };
}

export interface SessionResponse {
  response: string;
  toolExecutions: any[];
  routingInfo?: string;
  modelStats?: {
    model: string;
    responseTime: number;
    tokenCount?: number;
  };
}

/**
 * Professional session implementation following Claude Code patterns
 */
export class ProfessionalSession extends AiCliSession {
  private apiService!: OllamaApiService;
  private toolRegistry: ToolRegistry;
  private routerService!: RouterToolService;
  private permissionHandler: ((request: any) => Promise<any>) | null = null;
  private conversationContext: number[] = [];

  constructor(config: ProfessionalSessionConfig, baseDirectory: string = process.cwd()) {
    super(config);
    this.toolRegistry = new ToolRegistry();
  }

  /**
   * Initialize the session with API service and tools
   */
  async initialize(): Promise<void> {
    const config = this.config as ProfessionalSessionConfig;
    
    // Initialize API service
    this.apiService = await OllamaApiService.create({
      host: config.ollamaHost || 'http://localhost:11434',
      defaultModel: config.defaultModel,
      timeout: config.apiConfig?.timeout,
      retries: config.apiConfig?.retries,
      temperature: config.apiConfig?.temperature
    });

    // Initialize router service with simplified configuration
    const routerConfig = {
      primaryModel: config.defaultModel,
      classificationModel: undefined, // Skip classification for now
      toolExecutionThreshold: config.toolConfig?.toolExecutionThreshold || 0.7,
      enablePatternRouting: config.toolConfig?.enablePatternRouting || true,
      enableClassificationRouting: false // Disable until we adapt the interface
    };
    
    // Create a mock ollama client interface for the router
    const mockOllamaClient = {
      listModels: () => this.apiService.getAvailableModels(),
      generate: (req: any) => this.apiService.generateContent({
        model: req.model,
        prompt: req.prompt,
        options: req.options
      })
    };
    
    const router = new LocalToolRouter(mockOllamaClient as any, routerConfig);
    this.routerService = new RouterToolService(router, this.toolRegistry);

    // Set permission handler immediately after router service creation
    if (this.permissionHandler) {
      this.routerService.setPermissionHandler(this.permissionHandler);
      console.log('DEBUG: Permission handler set on router service');
    } else {
      console.log('DEBUG: No permission handler available during initialization');
    }
  }

  setPermissionHandler(handler: (request: any) => Promise<any>): void {
    console.log('DEBUG: Setting permission handler on professional session');
    this.permissionHandler = handler;
    if (this.routerService) {
      this.routerService.setPermissionHandler(handler);
      console.log('DEBUG: Permission handler successfully set on router service');
    } else {
      console.log('DEBUG: Router service not yet available, handler will be set during initialization');
    }
  }

  /**
   * Generate response with professional API management and tool routing
   */
  async generateResponseWithTools(userInput: string): Promise<SessionResponse> {
    if (!this.apiService) {
      await this.initialize();
    }

    const startTime = performance.now();

    // Add user message to conversation
    await this.addMessage({
      role: 'user',
      parts: [{ text: userInput }]
    });

    // Get conversation context for better routing
    const recentContext = this.getRecentConversationContext();

    // Process input with intelligent routing
    const { routingDecision, toolExecutions, summary } = await this.routerService.processUserInput(
      userInput,
      recentContext
    );

    let response: string;
    let modelStats: any;

    if (routingDecision.executeTools && toolExecutions.length > 0) {
      // Tools were executed - generate contextual response
      response = await this.generateToolAwareResponse(userInput, toolExecutions, routingDecision);
      modelStats = await this.getLastResponseStats();
    } else {
      // No tools needed - generate conversational response
      const result = await this.generateConversationalResponse(userInput);
      response = result.response;
      modelStats = result.stats;
    }

    // Add AI response to conversation
    await this.addMessage({
      role: 'model',
      parts: [{ text: response }]
    });

    const responseTime = performance.now() - startTime;

    return {
      response,
      toolExecutions: toolExecutions.map(te => ({
        toolName: te.toolName,
        params: te.params,
        result: te.result,
        executionTime: te.executionTime
      })),
      routingInfo: `${routingDecision.route} routing: ${routingDecision.reasoning}`,
      modelStats: {
        ...modelStats,
        responseTime
      }
    };
  }

  /**
   * Generate conversational response using API service
   */
  private async generateConversationalResponse(userInput: string): Promise<{
    response: string;
    stats: any;
  }> {
    const systemPrompt = this.createSystemPrompt();
    const request = this.apiService.createConversationalRequest(
      userInput,
      systemPrompt,
      this.conversationContext,
      {
        temperature: 0.8, // More creative for conversation
        num_predict: 500  // Reasonable limit for chat
      }
    );

    const apiResponse = await this.apiService.generateContent(request);
    this.conversationContext = apiResponse.context || [];

    const response = processAIResponse(apiResponse.response);

    return {
      response,
      stats: {
        model: apiResponse.model,
        promptTokens: apiResponse.prompt_eval_count,
        responseTokens: apiResponse.eval_count,
        totalDuration: apiResponse.total_duration,
        loadDuration: apiResponse.load_duration
      }
    };
  }

  /**
   * Generate response after tool execution
   */
  private async generateToolAwareResponse(
    userInput: string,
    toolExecutions: any[],
    routingDecision: any
  ): Promise<string> {
    const successfulExecutions = toolExecutions.filter(te => te.result.success);
    const failedExecutions = toolExecutions.filter(te => !te.result.success);

    // Create context about what was accomplished
    const executionContext = [
      `User request: "${userInput}"`,
      `Router used: ${routingDecision.route} (${routingDecision.reasoning})`,
      `Completed ${toolExecutions.length} tool execution(s):`,
      ...successfulExecutions.map(te => `✅ ${te.result.displayResult}`),
      ...failedExecutions.map(te => `❌ ${te.result.displayResult}`)
    ].join('\n');

    const systemPrompt = this.createSystemPrompt() + `

CONTEXT: You just completed tool executions for the user. Provide a helpful response acknowledging what was done.

Tool Execution Results:
${executionContext}

Respond naturally about what was accomplished. Be concise but informative.`;

    const request = this.apiService.createConversationalRequest(
      `Please summarize what was accomplished for: "${userInput}"`,
      systemPrompt,
      this.conversationContext,
      {
        temperature: 0.3, // More focused for summaries
        num_predict: 200  // Shorter for summaries
      }
    );

    const apiResponse = await this.apiService.generateContent(request);
    this.conversationContext = apiResponse.context || [];

    return processAIResponse(apiResponse.response);
  }

  /**
   * Create appropriate system prompt
   */
  private createSystemPrompt(): string {
    const toolDescriptions = this.toolRegistry.getToolDescriptions();
    
    return createSystemMessage('general', {
      currentDirectory: process.cwd(),
      availableTools: this.toolRegistry.getAllTools().map(t => t.displayName),
      userPreferences: {
        'response_style': 'conversational',
        'auto_tool_execution': true
      }
    }) + `

Available Tools: ${toolDescriptions}

IMPORTANT TOOL USAGE PATTERNS:
- When creating files, ALWAYS provide the code in a code block with the filename
- Example: "I'll create charizard.py with this code:" followed by \`\`\`python\nprint("Hello, World!")\n\`\`\`
- This allows the system to automatically detect and execute the file creation
- Be natural and conversational, but follow the code block pattern for file operations

IMPORTANT: Be natural and conversational. No hardcoded responses. Let your personality show through while being helpful and professional.`;
  }

  /**
   * Get recent conversation context
   */
  private getRecentConversationContext(): string {
    const state = this.getState();
    const recentMessages = state.conversationHistory.slice(-6); // Last 6 messages
    
    return recentMessages
      .map(msg => `${msg.role}: ${msg.parts.map(p => p.text).join('')}`)
      .join('\n');
  }

  /**
   * Get stats from last API response
   */
  private async getLastResponseStats(): Promise<any> {
    const config = this.apiService.getConfig();
    return {
      model: config.defaultModel,
      temperature: config.temperature
    };
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
   * Factory method for creating professional session
   */
  static async create(
    config: ProfessionalSessionConfig, 
    baseDirectory?: string,
    permissionHandler?: (request: any) => Promise<any>
  ): Promise<ProfessionalSession> {
    const session = new ProfessionalSession(config, baseDirectory);
    
    // Set permission handler before initialization
    if (permissionHandler) {
      session.setPermissionHandler(permissionHandler);
    }
    
    await session.initialize();
    return session;
  }
}