/**
 * Gemini CLI Style Session for Ollama
 * 
 * Implements proper tool calling without fake MCP syntax
 * Fails fast on errors, no fallbacks
 */

import { Content } from '../types.js';
import { AiCliSession, SessionConfig } from './session.js';
import { ToolRegistry, ToolCallDetector, ToolResult } from '../tools/geminiStyleTools.js';
import { processAIResponse } from '../utils/responseFilter.js';
import { createSystemMessage } from '../prompts/system.js';

export interface ToolExecution {
  toolName: string;
  params: Record<string, any>;
  result: ToolResult;
  executionTime: number;
}

export class GeminiStyleSession extends AiCliSession {
  private toolRegistry: ToolRegistry;
  private toolDetector: ToolCallDetector;
  private permissionHandler: ((request: any) => Promise<any>) | null = null;

  constructor(config: SessionConfig, baseDirectory: string = process.cwd()) {
    super(config);
    this.toolRegistry = new ToolRegistry();
    this.toolDetector = new ToolCallDetector(this.toolRegistry);
  }

  setPermissionHandler(handler: (request: any) => Promise<any>): void {
    this.permissionHandler = handler;
  }

  /**
   * Generate response with automatic tool execution
   */
  async generateResponseWithTools(userInput: string): Promise<{
    response: string;
    toolExecutions: ToolExecution[];
  }> {
    if (!this.permissionHandler) {
      throw new Error('Permission handler not set - cannot execute tools');
    }

    // Add user message
    await this.addMessage({
      role: 'user',
      parts: [{ text: userInput }]
    });

    // Generate initial response with tool awareness
    const contextualPrompt = this.createToolAwarePrompt(userInput);
    let rawResponse: string;
    
    try {
      rawResponse = await this.generateResponseWithPrompt(contextualPrompt);
    } catch (error) {
      throw new Error(`Failed to generate AI response: ${error instanceof Error ? error.message : String(error)}`);
    }

    const response = processAIResponse(rawResponse);

    // Detect and execute tools
    const toolCalls = this.toolDetector.detectToolCalls(response, userInput);
    const toolExecutions: ToolExecution[] = [];

    for (const toolCall of toolCalls) {
      const execution = await this.executeToolCall(toolCall.toolName, toolCall.params);
      toolExecutions.push(execution);
    }

    // Generate follow-up response if tools were executed
    let finalResponse = response;
    if (toolExecutions.length > 0) {
      const toolResults = toolExecutions
        .map(exec => `${exec.toolName}: ${exec.result.success ? exec.result.content : exec.result.error}`)
        .join('\n');

      const followUpPrompt = `Based on these completed actions:\n${toolResults}\n\nProvide a brief summary.`;
      
      try {
        const rawFollowUp = await this.generateResponseWithPrompt(followUpPrompt);
        const followUpResponse = processAIResponse(rawFollowUp);
        finalResponse = this.combineResponseWithTools(followUpResponse, toolExecutions);
      } catch (error) {
        throw new Error(`Failed to generate follow-up response: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Add final response to history
    await this.addMessage({
      role: 'model',
      parts: [{ text: finalResponse }]
    });

    return {
      response: finalResponse,
      toolExecutions
    };
  }

  /**
   * Execute a single tool call with permission checking
   */
  private async executeToolCall(toolName: string, params: Record<string, any>): Promise<ToolExecution> {
    const startTime = performance.now();
    
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Request permission
    if (!this.permissionHandler) {
      throw new Error('No permission handler configured');
    }

    const permissionRequest = {
      type: 'tool_execution',
      toolName: tool.displayName,
      params,
      description: `Execute ${tool.displayName}: ${tool.description}`,
      risk: this.assessToolRisk(toolName, params),
      preview: this.generateToolPreview(toolName, params)
    };

    const permission = await this.permissionHandler(permissionRequest);
    if (!permission.granted) {
      const result: ToolResult = {
        success: false,
        content: 'User denied permission',
        displayResult: '❌ Permission denied',
        error: 'User denied permission'
      };
      
      return {
        toolName,
        params,
        result,
        executionTime: performance.now() - startTime
      };
    }

    // Execute tool
    let result: ToolResult;
    try {
      result = await tool.execute(params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result = {
        success: false,
        content: `Tool execution failed: ${errorMessage}`,
        displayResult: `❌ ${tool.displayName} failed: ${errorMessage}`,
        error: errorMessage
      };
    }

    return {
      toolName,
      params,
      result,
      executionTime: performance.now() - startTime
    };
  }

  /**
   * Generate response with a specific prompt using base class method
   */
  private async generateResponseWithPrompt(prompt: string): Promise<string> {
    // Add the prompt as a temporary user message
    await this.addMessage({
      role: 'user',
      parts: [{ text: prompt }]
    });

    // Use the base class generateResponse method
    return await this.generateResponse(prompt);
  }

  /**
   * Create tool-aware prompt for AI using existing comprehensive system prompts
   */
  private createToolAwarePrompt(userInput: string): string {
    const toolDescriptions = this.toolRegistry.getToolDescriptions();
    
    // Use the existing comprehensive system prompts
    const baseSystemPrompt = createSystemMessage('general', {
      currentDirectory: process.cwd(),
      availableTools: this.toolRegistry.getAllTools().map(t => t.displayName),
      userPreferences: {
        'response_style': 'concise',
        'auto_tool_execution': true
      }
    });

    return `${baseSystemPrompt}

TOOL INTEGRATION UPDATES:
- NEVER generate fake tool calls, JSON blocks, or structured syntax
- Simply describe what you need to do in natural language
- The system automatically detects file creation, command execution, and file reading
- Tools are executed automatically when you express clear intentions

${toolDescriptions}

Examples of natural tool usage:
- "I'll create a hello.py file with the following code:" → system detects file creation
- "Let me run the command \`npm install\`" → system detects command execution  
- "I need to check the package.json file" → system detects file reading

Current user request: ${userInput}

Respond naturally and describe your approach. Tools will execute automatically.`;
  }

  /**
   * Generate a preview of what the tool will do
   */
  private generateToolPreview(toolName: string, params: Record<string, any>): string {
    switch (toolName) {
      case 'write_file':
        const filePath = params.file_path;
        const contentPreview = params.content ? 
          (params.content.length > 100 ? 
            params.content.substring(0, 100) + '...' : 
            params.content) : 
          'No content';
        return `Will create/overwrite file: ${filePath}\nContent preview:\n${contentPreview}`;
      
      case 'read_file':
        return `Will read file: ${params.file_path}`;
      
      case 'run_shell_command':
        return `Will execute command: ${params.command}`;
      
      case 'analyze_project':
        return `Will analyze current project structure and dependencies`;
      
      case 'create_feature':
        const components = params.components ? ` with components: ${params.components}` : '';
        return `Will create feature "${params.name}"${components}`;
      
      case 'add_component':
        const props = params.props ? ` with props: ${params.props}` : '';
        return `Will create component "${params.name}"${props} including tests and documentation`;
      
      case 'build_api':
        const endpoints = params.endpoints ? ` with endpoints: ${params.endpoints}` : '';
        return `Will build API layer for "${params.name}"${endpoints}`;
      
      case 'generate_code':
        return `Will generate ${params.type || 'code'} named "${params.name}"`;
      
      case 'add_tests':
        return `Will create tests for files: ${params.files || 'specified files'}`;
      
      default:
        return `Will execute ${toolName} with provided parameters`;
    }
  }

  /**
   * Assess risk level of tool execution
   */
  private assessToolRisk(toolName: string, params: Record<string, any>): 'safe' | 'moderate' | 'dangerous' {
    switch (toolName) {
      case 'read_file':
        return 'safe';
      case 'write_file':
        return 'moderate';
      case 'run_shell_command':
        const command = params.command as string;
        const dangerousPatterns = ['rm ', 'rmdir', 'del ', 'format', 'sudo ', 'chmod 777'];
        return dangerousPatterns.some(pattern => command.toLowerCase().includes(pattern)) 
          ? 'dangerous' 
          : 'moderate';
      default:
        return 'moderate';
    }
  }

  /**
   * Combine response with tool execution results
   */
  private combineResponseWithTools(response: string, executions: ToolExecution[]): string {
    const successfulExecutions = executions.filter(exec => exec.result.success);
    
    if (successfulExecutions.length === 0) {
      return response;
    }

    const executionSummary = successfulExecutions
      .map(exec => exec.result.displayResult)
      .join('\n');

    return `${response}\n\n${executionSummary}`;
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
}