/**
 * Gemini CLI Style Tool System for Ollama
 * 
 * Implements proper tool calling without relying on function calling API
 * Uses intelligent response parsing instead of fake structured calling
 */

import { IntelligentDevelopmentTool, IntelligentRequest } from './intelligentTools.js';

export interface ToolResult {
  success: boolean;
  content: string;
  displayResult: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  parameters: {
    [key: string]: {
      type: string;
      description: string;
      required?: boolean;
    };
  };
  execute: (params: Record<string, any>) => Promise<ToolResult>;
}

/**
 * Tool registry following Gemini CLI patterns
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private intelligentTool: IntelligentDevelopmentTool;

  constructor() {
    this.intelligentTool = new IntelligentDevelopmentTool();
    this.registerBuiltinTools();
    this.registerIntelligentTools();
  }

  private registerBuiltinTools(): void {
    // File system tools
    this.register({
      name: 'write_file',
      displayName: 'Write File',
      description: 'Create or overwrite a file with the specified content',
      parameters: {
        file_path: { 
          type: 'string', 
          description: 'Absolute path to the file to write',
          required: true 
        },
        content: { 
          type: 'string', 
          description: 'Content to write to the file',
          required: true 
        }
      },
      execute: this.executeWriteFile.bind(this)
    });

    this.register({
      name: 'read_file',
      displayName: 'Read File', 
      description: 'Read the contents of a file',
      parameters: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to read',
          required: true
        }
      },
      execute: this.executeReadFile.bind(this)
    });

    this.register({
      name: 'run_shell_command',
      displayName: 'Run Shell Command',
      description: 'Execute a shell command',
      parameters: {
        command: {
          type: 'string', 
          description: 'Shell command to execute',
          required: true
        }
      },
      execute: this.executeShellCommand.bind(this)
    });
  }

  /**
   * Register intelligent development tools
   */
  private registerIntelligentTools(): void {
    // Project analysis tool
    this.register({
      name: 'analyze_project',
      displayName: 'Analyze Project',
      description: 'Analyze project structure, dependencies, and provide insights',
      parameters: {},
      execute: async () => {
        const result = await this.intelligentTool.executeIntelligentRequest({
          type: 'analyze',
          target: 'project',
          description: 'Comprehensive project analysis'
        });
        return result;
      }
    });

    // Create complete feature
    this.register({
      name: 'create_feature',
      displayName: 'Create Feature',
      description: 'Create a complete feature with components, services, types, and tests',
      parameters: {
        name: { type: 'string', description: 'Feature name', required: true },
        description: { type: 'string', description: 'Feature description', required: true },
        components: { type: 'string', description: 'Comma-separated list of components to create' }
      },
      execute: async (params) => {
        const components = params.components ? 
          params.components.split(',').map((c: string) => c.trim()) : 
          undefined;
          
        const result = await this.intelligentTool.executeIntelligentRequest({
          type: 'create-feature',
          target: params.name,
          description: params.description,
          parameters: { components }
        });
        return result;
      }
    });

    // Add component suite
    this.register({
      name: 'add_component',
      displayName: 'Add Component',
      description: 'Create a component with tests, stories, and documentation',
      parameters: {
        name: { type: 'string', description: 'Component name', required: true },
        description: { type: 'string', description: 'Component description', required: true },
        props: { type: 'string', description: 'JSON string of component props' }
      },
      execute: async (params) => {
        let props;
        try {
          props = params.props ? JSON.parse(params.props) : undefined;
        } catch {
          props = undefined;
        }

        const result = await this.intelligentTool.executeIntelligentRequest({
          type: 'add-component',
          target: params.name,
          description: params.description,
          parameters: { props }
        });
        return result;
      }
    });

    // Build API layer
    this.register({
      name: 'build_api',
      displayName: 'Build API Layer',
      description: 'Create comprehensive API layer with types, services, and hooks',
      parameters: {
        name: { type: 'string', description: 'API entity name', required: true },
        description: { type: 'string', description: 'API description', required: true },
        endpoints: { type: 'string', description: 'Comma-separated list of endpoints (list,get,create,update,delete)' }
      },
      execute: async (params) => {
        const endpoints = params.endpoints ? 
          params.endpoints.split(',').map((e: string) => e.trim()) : 
          ['list', 'get', 'create', 'update', 'delete'];

        const result = await this.intelligentTool.executeIntelligentRequest({
          type: 'build-api',
          target: params.name,
          description: params.description,
          parameters: { endpoints }
        });
        return result;
      }
    });

    // Generate code
    this.register({
      name: 'generate_code',
      displayName: 'Generate Code',
      description: 'Generate code using intelligent templates based on project patterns',
      parameters: {
        type: { type: 'string', description: 'Type of code to generate (component, service, type, etc.)', required: true },
        name: { type: 'string', description: 'Name of the code element', required: true },
        description: { type: 'string', description: 'Description of what to generate', required: true }
      },
      execute: async (params) => {
        const result = await this.intelligentTool.executeIntelligentRequest({
          type: 'generate',
          target: params.name,
          description: `Generate ${params.type}: ${params.description}`
        });
        return result;
      }
    });

    // Add tests
    this.register({
      name: 'add_tests',
      displayName: 'Add Tests',
      description: 'Generate comprehensive test suite for existing files',
      parameters: {
        files: { type: 'string', description: 'Comma-separated list of files to test', required: true },
        description: { type: 'string', description: 'Test suite description' }
      },
      execute: async (params) => {
        const files = params.files.split(',').map((f: string) => f.trim());
        
        const result = await this.intelligentTool.executeIntelligentRequest({
          type: 'add-tests',
          target: 'test-suite',
          description: params.description || 'Comprehensive test suite',
          parameters: { files }
        });
        return result;
      }
    });
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolDescriptions(): string {
    const descriptions = this.getAllTools().map(tool => {
      const params = Object.entries(tool.parameters)
        .map(([name, param]) => `${name}: ${param.description}`)
        .join(', ');
      return `${tool.name}(${params}): ${tool.description}`;
    }).join('\n');

    return `Available tools:\n${descriptions}`;
  }

  private async executeWriteFile(params: Record<string, any>): Promise<ToolResult> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const filePath = params.file_path as string;
      const content = params.content as string;

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(filePath, content, 'utf-8');
      
      return {
        success: true,
        content: `File written successfully: ${filePath}`,
        displayResult: `✅ Created ${filePath} (${content.length} chars)`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Failed to write file: ${errorMessage}`,
        displayResult: `❌ Failed to create file: ${errorMessage}`,
        error: errorMessage
      };
    }
  }

  private async executeReadFile(params: Record<string, any>): Promise<ToolResult> {
    const fs = await import('fs/promises');
    
    try {
      const filePath = params.file_path as string;
      const content = await fs.readFile(filePath, 'utf-8');
      
      return {
        success: true,
        content: `File contents:\n${content}`,
        displayResult: `✅ Read ${filePath} (${content.length} chars)`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Failed to read file: ${errorMessage}`,
        displayResult: `❌ Failed to read file: ${errorMessage}`,
        error: errorMessage
      };
    }
  }

  private async executeShellCommand(params: Record<string, any>): Promise<ToolResult> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve) => {
      const command = params.command as string;
      const child = spawn('sh', ['-c', command]);
      
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            content: `Command executed successfully:\n${stdout}`,
            displayResult: `✅ Executed: ${command}\n${stdout}`
          });
        } else {
          resolve({
            success: false,
            content: `Command failed with code ${code}:\n${stderr}`,
            displayResult: `❌ Command failed: ${command}\n${stderr}`,
            error: stderr
          });
        }
      });
    });
  }
}

/**
 * Intelligent tool call detector for Ollama responses
 */
export class ToolCallDetector {
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Analyze AI response and detect tool intentions
   */
  detectToolCalls(response: string, userInput: string): Array<{
    toolName: string;
    params: Record<string, any>;
    confidence: number;
  }> {
    const detectedCalls: Array<{
      toolName: string;
      params: Record<string, any>;
      confidence: number;
    }> = [];

    // Detect file creation requests - improved pattern to catch more variations
    const fileCreationPatterns = [
      /(?:create|write|save|make).*?(?:file|script).*?(?:named?|called?)\s*([^\s]+\.[\w]+)/i,
      /(?:create|write|save|make).*?([^\s]+\.[\w]+).*?(?:file|script)/i,
      /(?:create|write|save|make)\s+(?:a\s+)?([^\s]+\.[\w]+)/i,
      /(?:I'll|Let me)\s+(?:create|write|save|make).*?([^\s]+\.[\w]+)/i
    ];
    
    let fileCreationMatch = null;
    for (const pattern of fileCreationPatterns) {
      fileCreationMatch = response.match(pattern) || userInput.match(pattern);
      if (fileCreationMatch) break;
    }
    
    if (fileCreationMatch) {
      const filename = fileCreationMatch[1];
      // Look for code blocks that should be the file content
      const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
      
      if (codeBlockMatch) {
        detectedCalls.push({
          toolName: 'write_file',
          params: {
            file_path: filename.startsWith('/') ? filename : `./${filename}`,
            content: codeBlockMatch[1].trim()
          },
          confidence: 0.9
        });
      }
    }

    // Detect command execution requests - improved patterns
    const commandPatterns = [
      /(?:run|execute).*?(?:command|the)\s*`([^`]+)`/i,
      /(?:run|execute).*?(?:command|the)\s+([a-zA-Z][\w\s-]+?)(?:\s|$)/i,
      /(?:I'll|Let me)\s+(?:run|execute).*?`([^`]+)`/i,
      /(?:run|execute).*?:\s*`([^`]+)`/i
    ];
    
    let commandMatch = null;
    for (const pattern of commandPatterns) {
      commandMatch = response.match(pattern);
      if (commandMatch) break;
    }
    
    if (commandMatch) {
      detectedCalls.push({
        toolName: 'run_shell_command',
        params: {
          command: commandMatch[1]
        },
        confidence: 0.8
      });
    }

    // Detect file reading requests
    const fileReadPattern = /(?:read|open|show|check).*?(?:file|contents?).*?([^\s]+\.[\w]+)/i;
    const fileReadMatch = response.match(fileReadPattern) || userInput.match(fileReadPattern);
    
    if (fileReadMatch) {
      detectedCalls.push({
        toolName: 'read_file',
        params: {
          file_path: fileReadMatch[1].startsWith('/') ? fileReadMatch[1] : `./${fileReadMatch[1]}`
        },
        confidence: 0.7
      });
    }

    // Detect intelligent operations
    const intelligentPatterns = this.detectIntelligentOperations(response, userInput);
    detectedCalls.push(...intelligentPatterns);

    return detectedCalls.filter(call => call.confidence > 0.6);
  }

  /**
   * Detect advanced development operations
   */
  private detectIntelligentOperations(response: string, userInput: string): Array<{
    toolName: string;
    params: Record<string, any>;
    confidence: number;
  }> {
    const detectedCalls: Array<{
      toolName: string;
      params: Record<string, any>;
      confidence: number;
    }> = [];
    
    const combinedText = `${response} ${userInput}`.toLowerCase();

    // Detect project analysis requests
    if (combinedText.match(/(?:analyze|understand|examine|review).*?(?:project|codebase|structure)/)) {
      detectedCalls.push({
        toolName: 'analyze_project',
        params: {},
        confidence: 0.9
      });
    }

    // Detect feature creation requests
    const featurePattern = /(?:create|build|add|implement).*?(?:feature|module).*?(?:called?|named?)\s*([^\s,.]+)/i;
    const featureMatch = combinedText.match(featurePattern);
    
    if (featureMatch) {
      const featureName = featureMatch[1];
      detectedCalls.push({
        toolName: 'create_feature',
        params: {
          name: featureName,
          description: `Create ${featureName} feature`
        },
        confidence: 0.85
      });
    }

    // Detect component creation requests
    const componentPattern = /(?:create|build|add|make).*?(?:component|widget).*?(?:called?|named?)\s*([^\s,.]+)/i;
    const componentMatch = combinedText.match(componentPattern);
    
    if (componentMatch && !featureMatch) { // Don't double-detect as both feature and component
      const componentName = componentMatch[1];
      detectedCalls.push({
        toolName: 'add_component',
        params: {
          name: componentName,
          description: `Create ${componentName} component`
        },
        confidence: 0.8
      });
    }

    // Detect API creation requests
    const apiPattern = /(?:create|build|add|implement).*?(?:api|service|endpoint).*?(?:for|called?|named?)\s*([^\s,.]+)/i;
    const apiMatch = combinedText.match(apiPattern);
    
    if (apiMatch) {
      const apiName = apiMatch[1];
      detectedCalls.push({
        toolName: 'build_api',
        params: {
          name: apiName,
          description: `Create API layer for ${apiName}`
        },
        confidence: 0.8
      });
    }

    // Detect test creation requests
    if (combinedText.match(/(?:add|create|write|generate).*?(?:tests?|testing|specs?)/)) {
      // Try to extract file names if mentioned
      const filePattern = /(?:for|test)\s+([^\s]+\.(?:js|ts|jsx|tsx))/gi;
      let files: string[] = [];
      let match;
      
      while ((match = filePattern.exec(combinedText)) !== null) {
        files.push(match[1]);
      }
      
      if (files.length > 0) {
        detectedCalls.push({
          toolName: 'add_tests',
          params: {
            files: files.join(','),
            description: 'Generate comprehensive test suite'
          },
          confidence: 0.75
        });
      }
    }

    // Detect general code generation requests
    const codeGenPattern = /(?:generate|create|write).*?(?:code|function|class|interface|type).*?(?:for|called?|named?)\s*([^\s,.]+)/i;
    const codeGenMatch = combinedText.match(codeGenPattern);
    
    if (codeGenMatch && !componentMatch && !featureMatch && !apiMatch) {
      const elementName = codeGenMatch[1];
      let type = 'function';
      
      if (combinedText.includes('component')) type = 'component';
      else if (combinedText.includes('service')) type = 'service'; 
      else if (combinedText.includes('type') || combinedText.includes('interface')) type = 'type';
      else if (combinedText.includes('hook')) type = 'hook';
      
      detectedCalls.push({
        toolName: 'generate_code',
        params: {
          type: type,
          name: elementName,
          description: `Generate ${type} ${elementName}`
        },
        confidence: 0.7
      });
    }

    return detectedCalls;
  }
}