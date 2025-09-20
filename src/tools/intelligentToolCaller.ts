/**
 * Smart tool detection - figures out what you want before you finish typing
 *
 * Uses regex patterns to catch common requests like "create file xyz" or "read abc.txt"
 * Then falls back to LLM if the patterns don't match. Works surprisingly well.
 */

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  confidence: number;
  source: 'intent_detection' | 'llm_function_call';
}

export interface IntentPattern {
  patterns: RegExp[];
  tool: string;
  extractParams: (match: RegExpMatchArray, input: string) => Record<string, any>;
  confidence: number;
}

export class IntelligentToolCaller {
  private intentPatterns: IntentPattern[] = [
    // Catch "create file xyz" type requests
    {
      patterns: [
        /(?:file\s+name|filename|name)\s+(?:to\s+be|is|should\s+be)\s+['"']?([^'"'\s]+(?:\.[a-zA-Z0-9]+)?)['"']?/i,
        /(?:called|named|with\s+name)\s+['"']?([^'"'\s]+(?:\.[a-zA-Z0-9]+)?)['"']?/i,
        /(?:create|make|write|generate).*?(?:file|script|document).*?(?:called|named|with\s+name)\s+['"']?([^'"'\s]+)['"']?/i,
        /(?:create|make|write)\s+(?:a\s+)?(?:new\s+)?(?:file\s+)?['"']?([^'"'\s]+(?:\.[a-zA-Z0-9]+)?)['"']?/i,
        /(?:save|write).*?(?:to|in|as)\s+['"']?([^'"'\s]+)['"']?/i
      ],
      tool: 'write_file',
      extractParams: (match, input) => {
        const fileName = this.extractBestFileName(match, input);
        const content = this.extractContentFromInput(input);
        const filePath = this.resolveFilePath(fileName);
        return { file_path: filePath, content };
      },
      confidence: 0.9
    },

    // "show me file.txt" patterns
    {
      patterns: [
        /(?:show|read|display|view|open|cat)\s+(?:me\s+)?(?:the\s+)?(?:file\s+)?['"']?([^'"'\s]+)['"']?/i,
        /(?:what'?s|what\s+is)\s+(?:in|inside)\s+(?:the\s+)?(?:file\s+)?['"']?([^'"'\s]+)['"']?/i,
        /(?:contents?\s+of|look\s+at)\s+['"']?([^'"'\s]+)['"']?/i
      ],
      tool: 'read_file',
      extractParams: (match) => {
        const fileName = match[1];
        const filePath = this.resolveFilePath(fileName);
        return { file_path: filePath };
      },
      confidence: 0.95
    },

    // Shell command patterns
    {
      patterns: [
        /(?:run|execute|exec)\s+['"']?([^'"']+)['"']?/i,
        /^(npm|yarn|git|node|python|pip|docker|kubectl)\s+([^"']*)/i,
        /^(ls|pwd|cd|mkdir|cp|mv|rm|find|grep|curl|wget)\s*(.*)/i
      ],
      tool: 'run_shell_command',
      extractParams: (match) => {
        const command = match[1] ? `${match[1]} ${match[2] || ''}`.trim() : match[0];
        return { command: command.replace(/^(run|execute|exec)\s+/i, '') };
      },
      confidence: 0.9
    },

    // Directory listing patterns
    {
      patterns: [
        /(?:list|show|display)\s+(?:the\s+)?(?:files?|contents?)\s*(?:in|of|from)\s*(?:the\s+)?(?:current\s+)?(?:directory|folder|dir)(?:\s+['"']?([^'"'\s]+)['"']?)?/i,
        /(?:list|show|display)\s+(?:the\s+)?(?:files?|contents?|directory)\s*(?:in|of|from)\s*['"']?([^'"'\s]+)['"']?/i,
        /(?:what'?s|what\s+is)\s+(?:in|inside)\s+(?:the\s+)?(?:directory|folder)\s+['"']?([^'"'\s]*)['"']?/i,
        /ls\s+['"']?([^'"'\s]*)['"']?/i
      ],
      tool: 'list_directory',
      extractParams: (match) => {
        const path = match[1] || '.';
        return { directory_path: this.resolveDirPath(path) };
      },
      confidence: 0.85
    },

    // File editing patterns
    {
      patterns: [
        /(?:edit|modify|update|change)\s+(?:the\s+)?(?:file\s+)?['"']?([^'"'\s]+)['"']?/i,
        /(?:add|append|insert).*?(?:to|into)\s+['"']?([^'"'\s]+)['"']?/i
      ],
      tool: 'read_file', // Read first, then suggest editing
      extractParams: (match) => {
        const fileName = match[1];
        const filePath = this.resolveFilePath(fileName);
        return { file_path: filePath };
      },
      confidence: 0.8
    }
  ];

  /**
   * Analyze user input and detect tool calling intent
   */
  detectToolIntent(input: string): ToolCall | null {
    const normalizedInput = input.trim();

    // Try each intent pattern
    for (const pattern of this.intentPatterns) {
      for (const regex of pattern.patterns) {
        const match = normalizedInput.match(regex);
        if (match) {
          try {
            const params = pattern.extractParams(match, normalizedInput);
            return {
              name: pattern.tool,
              arguments: params,
              confidence: pattern.confidence,
              source: 'intent_detection'
            };
          } catch (error) {
            console.warn('Failed to extract parameters for tool call:', error);
            continue;
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract the best filename from input, prioritizing explicit filename mentions
   */
  private extractBestFileName(match: RegExpMatchArray, input: string): string {
    // First, look for explicit filename patterns with higher priority
    const filenamePatterns = [
      /(?:file\s+name|filename|name)\s+(?:to\s+be|is|should\s+be)\s+['"']?([^'"'\s]+(?:\.[a-zA-Z0-9]+)?)['"']?/i,
      /(?:called|named)\s+['"']?([^'"'\s]+(?:\.[a-zA-Z0-9]+)?)['"']?/i,
      /(?:with\s+(?:the\s+)?name)\s+['"']?([^'"'\s]+(?:\.[a-zA-Z0-9]+)?)['"']?/i,
      /(?:save|write).*?(?:to|in|as)\s+['"']?([^'"'\s]+(?:\.[a-zA-Z0-9]+)?)['"']?/i
    ];

    for (const pattern of filenamePatterns) {
      const filenameMatch = input.match(pattern);
      if (filenameMatch && filenameMatch[1] && filenameMatch[1].includes('.')) {
        return filenameMatch[1];
      }
    }

    // If no explicit filename found, use the original match
    return match[1] || 'untitled.txt';
  }

  /**
   * Extract content from user input for file creation
   */
  private extractContentFromInput(input: string): string {
    // Look for content after "with", "containing", "that says", etc.
    const contentPatterns = [
      /(?:with|containing|that\s+says?|content)[:\s]+["']([^"']+)["']/i,
      /(?:with|containing|that\s+says?|content)[:\s]+(.+?)(?:\.|$)/i,
      /["']([^"']+)["']/i  // Quoted content
    ];

    for (const pattern of contentPatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Default content based on file type
    return this.getDefaultContent(input);
  }

  /**
   * Get default content based on context
   */
  private getDefaultContent(input: string): string {
    if (input.includes('hello world') || input.includes('hello')) {
      if (input.includes('.py')) return "print('Hello, World!')";
      if (input.includes('.js')) return "console.log('Hello, World!');";
      if (input.includes('.html')) return "<!DOCTYPE html>\n<html>\n<body>\n<h1>Hello, World!</h1>\n</body>\n</html>";
      return "Hello, World!";
    }

    if (input.includes('.py')) return "# Python script\nprint('Hello, World!')";
    if (input.includes('.js')) return "// JavaScript file\nconsole.log('Hello, World!');";
    if (input.includes('.md')) return "# New Document\n\nContent goes here.";
    if (input.includes('.json')) return "{\n  \"message\": \"Hello, World!\"\n}";

    return "# New file\n\nContent goes here.";
  }

  /**
   * Resolve file path (add current working directory if relative)
   */
  private resolveFilePath(fileName: string): string {
    // Clean the filename by removing trailing punctuation
    const cleanFileName = fileName.replace(/[?!.,;:]+$/, '');

    if (cleanFileName.startsWith('/')) {
      return cleanFileName; // Absolute path
    }
    return `${process.cwd()}/${cleanFileName}`;
  }

  /**
   * Resolve directory path
   */
  private resolveDirPath(path: string): string {
    if (!path || path === '.' || path === './') {
      return process.cwd();
    }
    if (path.startsWith('/')) {
      return path; // Absolute path
    }
    return `${process.cwd()}/${path}`;
  }

  /**
   * Check if input is likely a tool call request
   */
  isToolCallCandidate(input: string): boolean {
    const toolKeywords = [
      'create', 'make', 'write', 'generate', 'save',
      'read', 'show', 'display', 'view', 'open', 'cat',
      'run', 'execute', 'exec',
      'list', 'ls', 'dir',
      'edit', 'modify', 'update', 'change',
      'npm', 'git', 'node', 'python', 'docker'
    ];

    const normalizedInput = input.toLowerCase();
    return toolKeywords.some(keyword => normalizedInput.includes(keyword));
  }

  /**
   * Validate tool call parameters
   */
  validateToolCall(toolCall: ToolCall): boolean {
    switch (toolCall.name) {
      case 'write_file':
        return !!(toolCall.arguments.file_path && toolCall.arguments.content);
      case 'read_file':
        return !!toolCall.arguments.file_path;
      case 'run_shell_command':
        return !!toolCall.arguments.command;
      case 'list_directory':
        return !!toolCall.arguments.directory_path;
      default:
        return false;
    }
  }

  /**
   * Get confidence-based recommendation for tool usage
   */
  getRecommendation(input: string): { shouldUseTool: boolean; toolCall?: ToolCall; reason: string } {
    const toolCall = this.detectToolIntent(input);

    if (!toolCall) {
      return {
        shouldUseTool: false,
        reason: 'No clear tool intent detected'
      };
    }

    if (!this.validateToolCall(toolCall)) {
      return {
        shouldUseTool: false,
        reason: 'Invalid tool call parameters'
      };
    }

    if (toolCall.confidence >= 0.8) {
      return {
        shouldUseTool: true,
        toolCall,
        reason: `High confidence (${toolCall.confidence}) tool call detected`
      };
    }

    return {
      shouldUseTool: false,
      toolCall,
      reason: `Low confidence (${toolCall.confidence}) - may need LLM confirmation`
    };
  }
}