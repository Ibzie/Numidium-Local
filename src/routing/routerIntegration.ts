/**
 * Router Integration Service
 * 
 * Replaces the broken tool calling detection with intelligent routing
 */

import { LocalToolRouter, RouterConfig, RoutingDecision } from './localRouter.js';
import { ToolRegistry, ToolResult } from '../tools/geminiStyleTools.js';
import { OllamaClient } from '../ollama/client.js';

export interface RouterToolExecution {
  toolName: string;
  params: Record<string, any>;
  result: ToolResult;
  executionTime: number;
  routingDecision: RoutingDecision;
}

/**
 * Service that integrates routing with tool execution
 */
export class RouterToolService {
  private router: LocalToolRouter;
  private toolRegistry: ToolRegistry;
  private permissionHandler: ((request: any) => Promise<any>) | null = null;

  constructor(
    router: LocalToolRouter,
    toolRegistry: ToolRegistry
  ) {
    this.router = router;
    this.toolRegistry = toolRegistry;
  }

  setPermissionHandler(handler: (request: any) => Promise<any>): void {
    this.permissionHandler = handler;
  }

  /**
   * Process user input with intelligent routing and execute tools
   */
  async processUserInput(
    userInput: string, 
    conversationContext?: string
  ): Promise<{
    routingDecision: RoutingDecision;
    toolExecutions: RouterToolExecution[];
    summary: string;
  }> {
    // Get routing decision
    const routingDecision = await this.router.routeToolCalls(userInput, conversationContext);

    const toolExecutions: RouterToolExecution[] = [];

    // Execute tools if needed
    if (routingDecision.executeTools && routingDecision.toolCalls.length > 0) {
      for (const toolCall of routingDecision.toolCalls) {
        try {
          const execution = await this.executeToolCall(toolCall, routingDecision);
          toolExecutions.push(execution);
        } catch (error) {
          const failedExecution: RouterToolExecution = {
            toolName: toolCall.toolName,
            params: toolCall.params,
            result: {
              success: false,
              content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
              displayResult: `❌ ${toolCall.toolName} failed`,
              error: error instanceof Error ? error.message : String(error)
            },
            executionTime: 0,
            routingDecision
          };
          toolExecutions.push(failedExecution);
        }
      }
    }

    // Generate summary
    const summary = this.generateExecutionSummary(routingDecision, toolExecutions);

    return {
      routingDecision,
      toolExecutions,
      summary
    };
  }

  /**
   * Execute a single tool call with permission checking
   */
  private async executeToolCall(
    toolCall: { toolName: string; params: Record<string, any>; confidence: number },
    routingDecision: RoutingDecision
  ): Promise<RouterToolExecution> {
    const startTime = performance.now();

    const tool = this.toolRegistry.getTool(toolCall.toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolCall.toolName}`);
    }

    // Request permission if handler is available
    if (this.permissionHandler) {
      console.log('DEBUG: Requesting permission for tool:', toolCall.toolName);
      const permissionRequest = {
        type: 'tool_execution',
        toolName: tool.displayName,
        params: toolCall.params,
        description: `Execute ${tool.displayName}: ${tool.description}`,
        risk: this.assessToolRisk(toolCall.toolName, toolCall.params),
        preview: this.generateToolPreview(toolCall.toolName, toolCall.params),
        confidence: toolCall.confidence,
        route: routingDecision.route,
        reasoning: routingDecision.reasoning
      };

      console.log('DEBUG: Permission request:', JSON.stringify(permissionRequest, null, 2));
      const permission = await this.permissionHandler(permissionRequest);
      console.log('DEBUG: Permission response:', permission);
      if (!permission.granted) {
        const result: ToolResult = {
          success: false,
          content: 'User denied permission',
          displayResult: '❌ Permission denied',
          error: 'User denied permission'
        };

        return {
          toolName: toolCall.toolName,
          params: toolCall.params,
          result,
          executionTime: performance.now() - startTime,
          routingDecision
        };
      }
    }

    // Execute tool
    let result: ToolResult;
    try {
      result = await tool.execute(toolCall.params);
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
      toolName: toolCall.toolName,
      params: toolCall.params,
      result,
      executionTime: performance.now() - startTime,
      routingDecision
    };
  }

  /**
   * Generate execution summary
   */
  private generateExecutionSummary(
    routingDecision: RoutingDecision, 
    executions: RouterToolExecution[]
  ): string {
    const parts: string[] = [];

    // Add routing info
    parts.push(`🔀 Route: ${routingDecision.route} | Reason: ${routingDecision.reasoning}`);

    // Add execution results
    if (executions.length === 0) {
      parts.push('No tools executed');
    } else {
      const successful = executions.filter(e => e.result.success);
      const failed = executions.filter(e => !e.result.success);

      parts.push(`Executed ${executions.length} tool(s): ${successful.length} successful, ${failed.length} failed`);

      // Add details for each execution
      executions.forEach(execution => {
        parts.push(`• ${execution.result.displayResult} (${execution.executionTime.toFixed(0)}ms)`);
      });
    }

    return parts.join('\n');
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
      case 'analyze_project':
        return 'safe';
      case 'create_feature':
      case 'add_component':
      case 'build_api':
      case 'generate_code':
      case 'add_tests':
        return 'moderate';
      default:
        return 'moderate';
    }
  }

  /**
   * Generate tool preview
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
   * Factory method to create router service with optimal configuration
   */
  static async createWithOptimalConfig(
    ollamaClient: OllamaClient,
    primaryModel: string,
    toolRegistry: ToolRegistry
  ): Promise<RouterToolService> {
    const config = await LocalToolRouter.createOptimalConfig(ollamaClient, primaryModel);
    const router = new LocalToolRouter(ollamaClient, config);
    
    return new RouterToolService(router, toolRegistry);
  }
}