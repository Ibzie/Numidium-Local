/**
 * Central registry for all the tools the AI can use
 *
 * Keeps track of what tools exist, validates parameters, and handles
 * the permission system so the AI doesn't accidentally rm -rf your computer
 */

import { WriteFileTool } from './properWriteFile.js';
import { ReadFileTool } from './readFile.js';
import { RunShellTool } from './runShell.js';
import { ListDirectoryTool } from './listDirectory.js';

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  content: string;
  displayResult: string;
  error?: string;
}

export interface ToolCallConfirmationDetails {
  toolName: string;
  params: Record<string, any>;
  description: string;
  risk: 'safe' | 'moderate' | 'dangerous';
  preview: string;
}

export interface StructuredTool {
  name: string;
  displayName: string;
  description: string;
  schema: FunctionDeclaration;
  validateParams(params: Record<string, any>): string | null;
  shouldConfirmExecute(params: Record<string, any>): Promise<ToolCallConfirmationDetails | false>;
  execute(params: Record<string, any>): Promise<ToolResult>;
}

/**
 * Central registry for all structured tools
 */
export class ToolRegistry {
  private tools: Map<string, StructuredTool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    this.registerTool('write_file', WriteFileTool);
    this.registerTool('read_file', ReadFileTool);
    this.registerTool('run_shell_command', RunShellTool);
    this.registerTool('list_directory', ListDirectoryTool);
  }

  /**
   * Register a tool class as a structured tool
   */
  private registerTool(name: string, ToolClass: any): void {
    const tool: StructuredTool = {
      name: ToolClass.name,
      displayName: ToolClass.displayName,
      description: ToolClass.description,
      schema: ToolClass.schema,
      validateParams: ToolClass.validateParams.bind(ToolClass),
      shouldConfirmExecute: ToolClass.shouldConfirmExecute.bind(ToolClass),
      execute: ToolClass.execute.bind(ToolClass)
    };
    
    this.tools.set(name, tool);
  }

  /**
   * Get all available tools
   */
  getAllTools(): StructuredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool by name
   */
  getTool(name: string): StructuredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get function declarations for AI model
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    return this.getAllTools().map(tool => tool.schema);
  }

  /**
   * Get tool descriptions for system prompt
   */
  getToolDescriptions(): string {
    return this.getAllTools()
      .map(tool => `${tool.displayName}: ${tool.description}`)
      .join('\n');
  }

  /**
   * Execute a tool call with proper validation and confirmation
   */
  async executeToolCall(
    toolName: string, 
    params: Record<string, any>,
    permissionHandler?: (details: ToolCallConfirmationDetails) => Promise<boolean>
  ): Promise<ToolResult> {
    console.log('🛠️ ToolRegistry: executeToolCall called for', toolName);
    const tool = this.getTool(toolName);
    
    if (!tool) {
      console.log('❌ Tool not found:', toolName);
      return {
        success: false,
        content: `Unknown tool: ${toolName}`,
        displayResult: `❌ Unknown tool: ${toolName}`,
        error: `Tool '${toolName}' not found in registry`
      };
    }

    console.log('✅ Tool found:', tool.name);

    // Validate parameters
    const validationError = tool.validateParams(params);
    if (validationError) {
      console.log('❌ Validation failed:', validationError);
      return {
        success: false,
        content: `Validation failed: ${validationError}`,
        displayResult: `❌ ${validationError}`,
        error: validationError
      };
    }

    console.log('✅ Parameters validated');

    // Check if confirmation is needed
    console.log('🔐 Checking if confirmation is needed...');
    const confirmationDetails = await tool.shouldConfirmExecute(params);
    
    if (confirmationDetails) {
      console.log('🔐 Confirmation required:', confirmationDetails);
      if (permissionHandler) {
        console.log('🔐 Calling permission handler...');
        const approved = await permissionHandler(confirmationDetails);
        console.log('🔐 Permission result:', approved);
        if (!approved) {
          return {
            success: false,
            content: 'Tool execution cancelled by user',
            displayResult: '❌ Operation cancelled',
            error: 'User cancelled operation'
          };
        }
      } else {
        console.log('❌ No permission handler available!');
        return {
          success: false,
          content: 'Permission handler not available',
          displayResult: '❌ Permission handler not available',
          error: 'Permission handler not available'
        };
      }
    } else {
      console.log('✅ No confirmation needed');
    }

    // Execute the tool
    console.log('🔧 Executing tool...');
    return await tool.execute(params);
  }
}