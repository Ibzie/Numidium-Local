/**
 * Router-Based Session for Ollama
 * 
 * Replaces broken tool detection with intelligent routing
 * Uses lightweight local router for reliable tool calling
 */

import { Content } from '../types.js';
import { AiCliSession, SessionConfig } from './session.js';
import { ToolRegistry } from '../tools/geminiStyleTools.js';
import { RouterToolService } from '../routing/routerIntegration.js';
import { LocalToolRouter } from '../routing/localRouter.js';
import { OllamaClient } from '../ollama/client.js';
import { processAIResponse } from '../utils/responseFilter.js';
import { createSystemMessage } from '../prompts/system.js';

export interface RouterSessionConfig extends SessionConfig {
  /** Enable pattern-based routing */
  enablePatternRouting?: boolean;
  /** Enable classification routing with lightweight model */
  enableClassificationRouting?: boolean;
  /** Tool execution confidence threshold */
  toolExecutionThreshold?: number;
}

export class RouterSession extends AiCliSession {
  private routerService!: RouterToolService;
  private toolRegistry: ToolRegistry;
  private permissionHandler: ((request: any) => Promise<any>) | null = null;

  constructor(config: RouterSessionConfig, baseDirectory: string = process.cwd()) {
    super(config);
    this.toolRegistry = new ToolRegistry();
  }

  /**
   * Initialize the router service with optimal configuration
   */
  async initialize(): Promise<void> {
    const ollamaClient = new OllamaClient({ host: this.config.ollamaHost || 'http://localhost:11434' });
    
    this.routerService = await RouterToolService.createWithOptimalConfig(
      ollamaClient,
      this.config.defaultModel,
      this.toolRegistry
    );

    if (this.permissionHandler) {
      this.routerService.setPermissionHandler(this.permissionHandler);
    }
  }

  setPermissionHandler(handler: (request: any) => Promise<any>): void {
    this.permissionHandler = handler;
    if (this.routerService) {
      this.routerService.setPermissionHandler(handler);
    }
  }

  /**
   * Generate response with intelligent router-based tool execution
   */
  async generateResponseWithTools(userInput: string): Promise<{
    response: string;
    toolExecutions: any[];
    routingInfo: string;
  }> {
    if (!this.routerService) {
      await this.initialize();
    }

    // Add user message to conversation
    await this.addMessage({
      role: 'user',
      parts: [{ text: userInput }]
    });

    // Get conversation context for better routing
    const conversationContext = this.getRecentConversationContext();

    // Process input with router
    const { routingDecision, toolExecutions, summary } = await this.routerService.processUserInput(
      userInput,
      conversationContext
    );

    let response: string;

    // Generate appropriate response based on routing decision
    if (routingDecision.executeTools && toolExecutions.length > 0) {
      // Tools were executed, generate contextual response
      response = await this.generateToolAwareResponse(userInput, toolExecutions, routingDecision);
    } else {
      // No tools executed, generate normal response
      response = await this.generateNormalResponse(userInput);
    }

    // Add AI response to conversation
    await this.addMessage({
      role: 'model',
      parts: [{ text: response }]
    });

    return {
      response,
      toolExecutions: toolExecutions.map(te => ({
        toolName: te.toolName,
        params: te.params,
        result: te.result,
        executionTime: te.executionTime
      })),
      routingInfo: `${routingDecision.route} routing: ${routingDecision.reasoning}`
    };
  }

  /**
   * Generate response when tools were executed
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
      `Completed ${toolExecutions.length} tool execution(s):`,
      ...successfulExecutions.map(te => `✅ ${te.result.displayResult}`),
      ...failedExecutions.map(te => `❌ ${te.result.displayResult}`)
    ].join('\n');

    const contextualPrompt = this.createToolResultPrompt(userInput, executionContext);

    try {
      const rawResponse = await this.generateResponse(contextualPrompt);
      return processAIResponse(rawResponse);
    } catch (error) {
      // Fallback to simple summary if response generation fails
      return `I've completed your request:\n\n${executionContext}`;
    }
  }

  /**
   * Generate normal response without tool execution
   */
  private async generateNormalResponse(userInput: string): Promise<string> {
    const systemPrompt = this.createNormalResponsePrompt(userInput);
    
    try {
      // Clear any response caching by adding uniqueness to the prompt
      const uniquePrompt = `${systemPrompt}\n\nIMPORTANT: Do NOT repeat previous responses. Each response should be unique and varied. Current timestamp: ${Date.now()}`;
      const rawResponse = await this.generateResponse(uniquePrompt);
      return processAIResponse(rawResponse);
    } catch (error) {
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create prompt for responses after tool execution
   */
  private createToolResultPrompt(userInput: string, executionContext: string): string {
    const baseSystemPrompt = createSystemMessage('general', {
      currentDirectory: process.cwd(),
      availableTools: this.toolRegistry.getAllTools().map(t => t.displayName),
      userPreferences: {
        'response_style': 'concise',
        'auto_tool_execution': true
      }
    });

    return `${baseSystemPrompt}

CONTEXT: I just executed tools based on the user's request.

User request: ${userInput}

Tool execution results:
${executionContext}

Provide a brief, helpful response acknowledging what was accomplished. Be concise and focus on the results.`;
  }

  /**
   * Create prompt for normal responses
   */
  private createNormalResponsePrompt(userInput: string): string {
    const toolDescriptions = this.toolRegistry.getToolDescriptions();
    const conversationContext = this.getRecentConversationContext();
    
    const baseSystemPrompt = createSystemMessage('general', {
      currentDirectory: process.cwd(),
      availableTools: this.toolRegistry.getAllTools().map(t => t.displayName),
      userPreferences: {
        'response_style': 'conversational',
        'auto_tool_execution': true
      }
    });

    // Analyze the input type to provide appropriate guidance
    let responseGuidance = '';
    const input = userInput.toLowerCase();
    
    if (input.includes('hello') || input.includes('hi') || input.includes('yo') || input.includes('hey')) {
      responseGuidance = 'This is a greeting. Respond warmly but vary your greeting style. Be casual and friendly.';
    } else if (input.includes('how are you') || input.includes('what\'s up')) {
      responseGuidance = 'This is a casual check-in. Respond in a friendly, conversational way without being overly repetitive.';
    } else if (input.includes('capabilities') || input.includes('help') || input.includes('what can you')) {
      responseGuidance = 'This is asking about your abilities. Be specific and helpful about what you can do.';
    } else if (input.includes('conversation') || input.includes('chat') || input.includes('talk')) {
      responseGuidance = 'They want to chat. Be engaging and ask something interesting or offer to help.';
    } else {
      responseGuidance = 'Respond naturally to what they said. Match their tone and be helpful.';
    }

    return `${baseSystemPrompt}

CONVERSATION CONTEXT:
${conversationContext}

CURRENT SITUATION: This is a conversational message - no tools needed! Just chat naturally.

RESPONSE GUIDANCE: ${responseGuidance}

User just said: "${userInput}"

Available tools when needed: ${toolDescriptions}

Respond appropriately to their specific message. DO NOT use the same greeting repeatedly. Vary your responses and be genuinely conversational.`;
  }

  /**
   * Get recent conversation context for router
   */
  private getRecentConversationContext(): string {
    const state = this.getState();
    const recentMessages = state.conversationHistory.slice(-4); // Last 4 messages
    
    return recentMessages
      .map(msg => `${msg.role}: ${msg.parts.map(p => p.text).join('')}`)
      .join('\n');
  }

  /**
   * Get current model from session
   */
  getCurrentModel(): string {
    return this.getState().currentModel;
  }

  /**
   * Switch model with proper error handling
   */
  async switchModel(modelName: string): Promise<boolean> {
    try {
      const success = await super.switchModel(modelName);
      if (!success) {
        throw new Error(`Failed to switch to model: ${modelName}`);
      }
      
      // Reinitialize router with new model
      await this.initialize();
      
      return true;
    } catch (error) {
      throw new Error(`Model switching failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear session history
   */
  clearHistory(): void {
    const state = this.getState();
    state.conversationHistory = [];
    state.tokenCount = 0;
    state.compactionCount = 0;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): {
    patternRoutingEnabled: boolean;
    classificationRoutingEnabled: boolean;
    availableTools: number;
  } {
    return {
      patternRoutingEnabled: true,
      classificationRoutingEnabled: !!this.routerService,
      availableTools: this.toolRegistry.getAllTools().length
    };
  }
}