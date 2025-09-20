/**
 * Lightweight Local Router for Tool Calling
 * 
 * Combines multiple routing strategies for intelligent tool calling:
 * 1. Pattern-based routing for simple operations
 * 2. Small model classification for complex decisions
 * 3. Fallback to main model for ambiguous cases
 */

import { OllamaClient } from '../ollama/client.js';

export interface RoutingDecision {
  /** Should execute tools directly */
  executeTools: boolean;
  /** Detected tool calls */
  toolCalls: Array<{
    toolName: string;
    params: Record<string, any>;
    confidence: number;
  }>;
  /** Reasoning for the decision */
  reasoning: string;
  /** Route taken (pattern|classification|fallback) */
  route: 'pattern' | 'classification' | 'fallback';
}

export interface RouterConfig {
  /** Primary model for complex tasks */
  primaryModel: string;
  /** Lightweight model for classification (e.g., 'qwen2.5:0.5b', 'gemma2:2b') */
  classificationModel?: string;
  /** Confidence threshold for tool execution */
  toolExecutionThreshold: number;
  /** Enable pattern-based routing */
  enablePatternRouting: boolean;
  /** Enable classification routing */
  enableClassificationRouting: boolean;
}

/**
 * Lightweight local router that intelligently routes tool calling decisions
 */
export class LocalToolRouter {
  private ollamaClient: OllamaClient;
  private config: RouterConfig;
  private patternCache: Map<string, RoutingDecision> = new Map();

  constructor(ollamaClient: OllamaClient, config: RouterConfig) {
    this.ollamaClient = ollamaClient;
    this.config = config;
  }

  /**
   * Route user input to determine if and which tools should be executed
   */
  async routeToolCalls(userInput: string, conversationContext?: string): Promise<RoutingDecision> {
    // Stage 1: Pattern-based routing (fast, no LLM call)
    if (this.config.enablePatternRouting) {
      const patternDecision = this.performPatternRouting(userInput);
      if (patternDecision.toolCalls.some(tc => tc.confidence >= this.config.toolExecutionThreshold)) {
        return { ...patternDecision, route: 'pattern' };
      }
    }

    // Stage 2: Classification model routing (lightweight LLM call)
    if (this.config.enableClassificationRouting && this.config.classificationModel) {
      try {
        const classificationDecision = await this.performClassificationRouting(userInput, conversationContext);
        if (classificationDecision.toolCalls.some(tc => tc.confidence >= this.config.toolExecutionThreshold)) {
          return { ...classificationDecision, route: 'classification' };
        }
      } catch (error) {
        console.warn('Classification routing failed, falling back:', error);
      }
    }

    // Stage 3: No tools detected
    return {
      executeTools: false,
      toolCalls: [],
      reasoning: 'No clear tool usage patterns detected',
      route: 'fallback'
    };
  }

  /**
   * Pattern-based routing using regex and keyword detection
   */
  private performPatternRouting(userInput: string): RoutingDecision {
    const input = userInput.toLowerCase();
    const detectedCalls: RoutingDecision['toolCalls'] = [];

    // File operations patterns - improved to be more flexible
    const filePatterns = [
      {
        pattern: /(?:create|write|save|make).*?(?:file|script).*?([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/i,
        tool: 'write_file',
        confidence: 0.9,
        extractParams: (match: RegExpMatchArray, fullInput: string) => {
          const filename = match[1];
          // Look for code blocks
          const codeMatch = fullInput.match(/```(?:\w+)?\n([\s\S]*?)```/);
          return {
            file_path: filename.startsWith('/') ? filename : `./${filename}`,
            content: codeMatch ? codeMatch[1].trim() : ''
          };
        }
      },
      {
        pattern: /(?:create|write|save|make)\s+(?:a\s+)?([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/i,
        tool: 'write_file', 
        confidence: 0.8,
        extractParams: (match: RegExpMatchArray, fullInput: string) => {
          const filename = match[1];
          const codeMatch = fullInput.match(/```(?:\w+)?\n([\s\S]*?)```/);
          return {
            file_path: filename.startsWith('/') ? filename : `./${filename}`,
            content: codeMatch ? codeMatch[1].trim() : ''
          };
        }
      },
      {
        pattern: /(?:I'll|Let me|I will)\s+(?:create|write|make).*?([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/i,
        tool: 'write_file',
        confidence: 0.85,
        extractParams: (match: RegExpMatchArray, fullInput: string) => {
          const filename = match[1];
          const codeMatch = fullInput.match(/```(?:\w+)?\n([\s\S]*?)```/);
          return {
            file_path: filename.startsWith('/') ? filename : `./${filename}`,
            content: codeMatch ? codeMatch[1].trim() : ''
          };
        }
      },
      {
        pattern: /(?:read|show|check|open).*?(?:file|contents?).*?([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/i,
        tool: 'read_file',
        confidence: 0.8,
        extractParams: (match: RegExpMatchArray) => ({
          file_path: match[1].startsWith('/') ? match[1] : `./${match[1]}`
        })
      }
    ];

    // Command execution patterns
    const commandPatterns = [
      {
        pattern: /(?:run|execute).*?(?:command|cmd).*?[`'""]([^`'""]+)[`'""]|(?:run|execute)\s+([a-zA-Z][\w\s-]+?)(?:\s|$)/i,
        tool: 'run_shell_command',
        confidence: 0.85,
        extractParams: (match: RegExpMatchArray) => ({
          command: match[1] || match[2]
        })
      }
    ];

    // Intelligent development patterns
    const intelligentPatterns = [
      {
        pattern: /(?:analyze|understand|examine|review).*?(?:project|codebase|structure)/i,
        tool: 'analyze_project',
        confidence: 0.9,
        extractParams: () => ({})
      },
      {
        pattern: /(?:create|build|add|implement).*?(?:feature|module).*?(?:called?|named?)\s*([a-zA-Z][a-zA-Z0-9_]*)/i,
        tool: 'create_feature',
        confidence: 0.85,
        extractParams: (match: RegExpMatchArray) => ({
          name: match[1],
          description: `Create ${match[1]} feature`
        })
      },
      {
        pattern: /(?:create|build|add|make).*?(?:component|widget).*?(?:called?|named?)\s*([a-zA-Z][a-zA-Z0-9_]*)/i,
        tool: 'add_component',
        confidence: 0.8,
        extractParams: (match: RegExpMatchArray) => ({
          name: match[1],
          description: `Create ${match[1]} component`
        })
      },
      {
        pattern: /(?:create|build|add|implement).*?(?:api|service|endpoint).*?(?:for|called?|named?)\s*([a-zA-Z][a-zA-Z0-9_]*)/i,
        tool: 'build_api',
        confidence: 0.8,
        extractParams: (match: RegExpMatchArray) => ({
          name: match[1],
          description: `Create API layer for ${match[1]}`
        })
      }
    ];

    // Apply all patterns (avoid duplicates)
    const allPatterns = [...filePatterns, ...commandPatterns, ...intelligentPatterns];
    const detectedTools = new Set<string>();
    
    for (const patternConfig of allPatterns) {
      const match = userInput.match(patternConfig.pattern);
      if (match) {
        // Skip if we already detected this tool (prevent duplicates)
        if (detectedTools.has(patternConfig.tool)) continue;
        
        const params = patternConfig.extractParams(match, userInput);
        console.log('DEBUG: Pattern matched for', patternConfig.tool, 'with params:', params);
        detectedCalls.push({
          toolName: patternConfig.tool,
          params,
          confidence: patternConfig.confidence
        });
        detectedTools.add(patternConfig.tool);
      }
    }

    return {
      executeTools: detectedCalls.length > 0,
      toolCalls: detectedCalls,
      reasoning: detectedCalls.length > 0 
        ? `Pattern-based detection found ${detectedCalls.length} tool(s)`
        : 'No tool patterns detected',
      route: 'pattern' as const
    };
  }

  /**
   * Classification-based routing using lightweight model
   */
  private async performClassificationRouting(userInput: string, conversationContext?: string): Promise<RoutingDecision> {
    if (!this.config.classificationModel) {
      throw new Error('Classification model not configured');
    }

    const classificationPrompt = this.buildClassificationPrompt(userInput, conversationContext);
    
    const response = await this.ollamaClient.generate({
      model: this.config.classificationModel,
      prompt: classificationPrompt,
      stream: false,
      options: { 
        temperature: 0.1, 
        num_predict: 200 // Low temperature, short response for efficiency
      }
    });

    return this.parseClassificationResponse(response.response, userInput);
  }

  /**
   * Build prompt for classification model
   */
  private buildClassificationPrompt(userInput: string, conversationContext?: string): string {
    return `You are a tool classification system. Analyze the user input and determine if tools should be executed.

Available tools:
- write_file: Create/overwrite files
- read_file: Read file contents
- run_shell_command: Execute shell commands
- analyze_project: Analyze project structure
- create_feature: Create complete features
- add_component: Add React components
- build_api: Create API layers
- generate_code: Generate specific code
- add_tests: Create test suites

User input: "${userInput}"
${conversationContext ? `Context: ${conversationContext}` : ''}

Respond with ONLY this format:
TOOLS: [tool1:confidence,tool2:confidence] or NONE
PARAMS: {key:value,key:value} (if tools detected)
REASON: Brief explanation

Example:
TOOLS: write_file:0.9
PARAMS: file_path:hello.py,content:print('hello')
REASON: User wants to create a Python file`;
  }

  /**
   * Parse classification model response
   */
  private parseClassificationResponse(response: string, userInput: string): RoutingDecision {
    try {
      const lines = response.trim().split('\n');
      const toolsLine = lines.find(l => l.startsWith('TOOLS:'))?.substring(6).trim();
      const paramsLine = lines.find(l => l.startsWith('PARAMS:'))?.substring(7).trim();
      const reasonLine = lines.find(l => l.startsWith('REASON:'))?.substring(7).trim();

      if (!toolsLine || toolsLine === 'NONE') {
        return {
          executeTools: false,
          toolCalls: [],
          reasoning: reasonLine || 'No tools needed based on classification',
          route: 'classification' as const
        };
      }

      // Parse tools
      const toolCalls: RoutingDecision['toolCalls'] = [];
      const toolPairs = toolsLine.split(',');
      
      for (const toolPair of toolPairs) {
        const [toolName, confidenceStr] = toolPair.trim().split(':');
        const confidence = parseFloat(confidenceStr) || 0.5;
        
        // Parse params
        let params: Record<string, any> = {};
        if (paramsLine) {
          const paramPairs = paramsLine.split(',');
          for (const paramPair of paramPairs) {
            const [key, value] = paramPair.trim().split(':');
            if (key && value) {
              params[key] = value;
            }
          }
        }

        toolCalls.push({
          toolName: toolName.trim(),
          params,
          confidence
        });
      }

      return {
        executeTools: toolCalls.some(tc => tc.confidence >= this.config.toolExecutionThreshold),
        toolCalls,
        reasoning: reasonLine || 'Tools detected via classification',
        route: 'classification' as const
      };
    } catch (error) {
      throw new Error(`Failed to parse classification response: ${error}`);
    }
  }

  /**
   * Get optimal router configuration based on available models
   */
  static async createOptimalConfig(ollamaClient: OllamaClient, primaryModel: string): Promise<RouterConfig> {
    const availableModels = await ollamaClient.listModels();
    
    // Find best lightweight model for classification
    const lightweightModels = [
      'qwen2.5:0.5b',
      'gemma2:2b', 
      'phi3:mini',
      'tinyllama:latest'
    ];

    let classificationModel: string | undefined;
    for (const model of lightweightModels) {
      if (availableModels.some((m: any) => m.name === model)) {
        classificationModel = model;
        break;
      }
    }

    return {
      primaryModel,
      classificationModel,
      toolExecutionThreshold: 0.7,
      enablePatternRouting: true,
      enableClassificationRouting: !!classificationModel
    };
  }
}