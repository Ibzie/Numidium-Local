/**
 * Tool Orchestrator - Claude SDK Inspired Architecture
 *
 * Combines automatic intent detection with LLM-based function calling
 * for a more reliable and intelligent tool calling system
 */

import { IntelligentToolCaller, ToolCall } from './intelligentToolCaller.js';
import { ToolRegistry, ToolResult, ToolCallConfirmationDetails } from './toolRegistry.js';

export interface ToolExecutionContext {
  userInput: string;
  conversationHistory?: string[];
  workingDirectory: string;
  availableTools: string[];
}

export interface ToolExecutionResult {
  success: boolean;
  toolCall?: ToolCall;
  result?: ToolResult;
  needsLLMConfirmation?: boolean;
  suggestedPrompt?: string;
  executionTime: number;
  source: 'automatic' | 'llm_guided' | 'failed';
}

/**
 * Orchestrates tool calling using multiple strategies:
 * 1. Automatic intent detection for obvious requests
 * 2. LLM-guided function calling for complex requests
 * 3. Hybrid approach for ambiguous cases
 */
export class ToolOrchestrator {
  private intelligentCaller: IntelligentToolCaller;
  private toolRegistry: ToolRegistry;
  private permissionHandler?: (request: ToolCallConfirmationDetails) => Promise<boolean>;

  constructor(
    toolRegistry: ToolRegistry,
    permissionHandler?: (request: ToolCallConfirmationDetails) => Promise<boolean>
  ) {
    this.intelligentCaller = new IntelligentToolCaller();
    this.toolRegistry = toolRegistry;
    this.permissionHandler = permissionHandler;
  }

  /**
   * Main orchestration method - tries automatic detection first, falls back to LLM
   */
  async orchestrateToolCall(
    context: ToolExecutionContext,
    llmFunctionCall?: { name: string; arguments: Record<string, any> }
  ): Promise<ToolExecutionResult> {
    const startTime = performance.now();

    try {
      // Strategy 1: Try automatic intent detection first
      const automaticResult = await this.tryAutomaticExecution(context);
      if (automaticResult.success) {
        return {
          ...automaticResult,
          executionTime: performance.now() - startTime,
          source: 'automatic'
        };
      }

      // Strategy 2: Use LLM function call if provided
      if (llmFunctionCall) {
        const llmResult = await this.executeLLMFunctionCall(llmFunctionCall, context);
        return {
          ...llmResult,
          executionTime: performance.now() - startTime,
          source: 'llm_guided'
        };
      }

      // Strategy 3: Check if this should be a tool call but we couldn't detect it
      if (this.intelligentCaller.isToolCallCandidate(context.userInput)) {
        return {
          success: false,
          needsLLMConfirmation: true,
          suggestedPrompt: this.generateLLMGuidancePrompt(context),
          executionTime: performance.now() - startTime,
          source: 'failed'
        };
      }

      // Not a tool call - return unsuccessful
      return {
        success: false,
        executionTime: performance.now() - startTime,
        source: 'failed'
      };

    } catch (error) {
      console.error('Tool orchestration error:', error);
      return {
        success: false,
        executionTime: performance.now() - startTime,
        source: 'failed'
      };
    }
  }

  /**
   * Try automatic execution based on intent detection
   */
  private async tryAutomaticExecution(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const recommendation = this.intelligentCaller.getRecommendation(context.userInput);

    if (!recommendation.shouldUseTool || !recommendation.toolCall) {
      return { success: false, executionTime: 0, source: 'automatic' };
    }

    // Execute the detected tool call
    const result = await this.executeToolCall(recommendation.toolCall, context);

    return {
      success: result.success,
      toolCall: recommendation.toolCall,
      result,
      executionTime: 0, // Will be set by caller
      source: 'automatic'
    };
  }

  /**
   * Execute LLM-provided function call
   */
  private async executeLLMFunctionCall(
    functionCall: { name: string; arguments: Record<string, any> },
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const toolCall: ToolCall = {
      name: functionCall.name,
      arguments: functionCall.arguments,
      confidence: 1.0, // LLM calls get full confidence
      source: 'llm_function_call'
    };

    const result = await this.executeToolCall(toolCall, context);

    return {
      success: result.success,
      toolCall,
      result,
      executionTime: 0, // Will be set by caller
      source: 'llm_guided'
    };
  }

  /**
   * Execute a tool call with proper error handling and permissions
   */
  private async executeToolCall(toolCall: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      console.log(`🔧 Executing ${toolCall.name} with confidence ${toolCall.confidence}`);
      console.log('🔧 Parameters:', toolCall.arguments);

      // Execute through tool registry
      const result = await this.toolRegistry.executeToolCall(
        toolCall.name,
        toolCall.arguments,
        this.permissionHandler
      );

      console.log('🔧 Tool execution result:', result.success ? '✅ Success' : '❌ Failed');
      return result;

    } catch (error) {
      console.error('🔧 Tool execution error:', error);
      return {
        success: false,
        content: '',
        displayResult: `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate a prompt to guide the LLM towards making a function call
   */
  private generateLLMGuidancePrompt(context: ToolExecutionContext): string {
    const availableTools = context.availableTools.join(', ');

    return `The user's request seems like it might need a tool call, but I couldn't detect the exact intent.

User input: "${context.userInput}"
Available tools: ${availableTools}

Please analyze this request and determine if it needs a function call. If so, respond with the appropriate JSON function call format.`;
  }

  /**
   * Check if a user input should trigger tool calling
   */
  shouldAttemptToolCall(userInput: string): boolean {
    return this.intelligentCaller.isToolCallCandidate(userInput);
  }

  /**
   * Get tool calling statistics and insights
   */
  getToolCallInsights(userInput: string): {
    isCandidate: boolean;
    detectedIntent?: ToolCall;
    confidence?: number;
    recommendedAction: string;
  } {
    const isCandidate = this.intelligentCaller.isToolCallCandidate(userInput);
    const detected = this.intelligentCaller.detectToolIntent(userInput);
    const recommendation = this.intelligentCaller.getRecommendation(userInput);

    return {
      isCandidate,
      detectedIntent: detected || undefined,
      confidence: detected?.confidence,
      recommendedAction: recommendation.reason
    };
  }

  /**
   * Create a formatted response that explains what tool was executed
   */
  formatToolExecutionResponse(
    result: ToolExecutionResult,
    originalInput: string
  ): string {
    if (!result.success || !result.result) {
      return result.suggestedPrompt || 'I couldn\'t determine how to help with that request.';
    }

    const { toolCall, result: toolResult, source } = result;

    let response = '';

    // Add execution context
    if (source === 'automatic') {
      response += '🔍 I automatically detected that you wanted to ';
    } else {
      response += '🤖 Based on your request, I ';
    }

    // Add tool-specific messaging
    switch (toolCall?.name) {
      case 'write_file':
        response += `create a file at \`${toolCall.arguments.file_path}\``;
        break;
      case 'read_file':
        response += `read the file \`${toolCall.arguments.file_path}\``;
        break;
      case 'run_shell_command':
        response += `run the command \`${toolCall.arguments.command}\``;
        break;
      case 'list_directory':
        response += `list the contents of \`${toolCall.arguments.path}\``;
        break;
      default:
        response += `execute ${toolCall?.name}`;
    }

    response += '.\n\n';

    // Add the actual result
    if (toolResult.success) {
      response += '✅ **Result:**\n';
      response += toolResult.displayResult;
    } else {
      response += '❌ **Error:**\n';
      response += toolResult.error || 'Unknown error occurred';
    }

    return response;
  }
}