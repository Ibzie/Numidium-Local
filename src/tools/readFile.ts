/**
 * Read File Tool - Following Gemini CLI Architecture
 */

import fs from 'fs/promises';
import path from 'path';
import { ToolResult, ToolCallConfirmationDetails } from './toolRegistry.js';

export interface ReadFileParams {
  /** The absolute path to the file to read */
  file_path: string;
  /** Optional line limit to prevent reading very large files */
  line_limit?: number;
}

/**
 * Read File Tool following Gemini CLI patterns
 */
export class ReadFileTool {
  static readonly name = 'read_file';
  static readonly displayName = 'Read File';
  static readonly description = 'Reads the contents of a specified file from the local filesystem';

  /**
   * JSON Schema for function calling
   */
  static readonly schema = {
    name: 'read_file',
    description: 'Reads the contents of a specified file from the local filesystem. Can limit output to prevent reading very large files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read (e.g., \'/home/user/project/file.txt\'). Relative paths will be converted to absolute.'
        },
        line_limit: {
          type: 'number',
          description: 'Optional limit on number of lines to read (default: 1000 lines for safety)'
        }
      },
      required: ['file_path']
    }
  };

  /**
   * Validate parameters
   */
  static validateParams(params: ReadFileParams): string | null {
    if (!params.file_path) {
      return 'Missing or empty "file_path"';
    }
    if (params.line_limit !== undefined && params.line_limit < 1) {
      return 'line_limit must be positive if provided';
    }
    return null;
  }

  /**
   * Check if tool execution should be confirmed
   */
  static async shouldConfirmExecute(params: ReadFileParams): Promise<ToolCallConfirmationDetails | false> {
    // Convert relative paths to absolute
    const filePath = path.isAbsolute(params.file_path) 
      ? params.file_path 
      : path.resolve(process.cwd(), params.file_path);

    // Check if file exists
    let fileExists = false;
    let fileSize = 0;
    try {
      const stats = await fs.stat(filePath);
      fileExists = true;
      fileSize = stats.size;
    } catch {
      // File doesn't exist
    }

    if (!fileExists) {
      return false; // No confirmation needed for non-existent files (will error anyway)
    }

    // Assess risk based on file size
    let risk: 'safe' | 'moderate' | 'dangerous' = 'safe';
    if (fileSize > 10 * 1024 * 1024) { // > 10MB
      risk = 'dangerous';
    } else if (fileSize > 1024 * 1024) { // > 1MB
      risk = 'moderate';
    }

    return {
      toolName: this.displayName,
      params: { ...params, file_path: filePath },
      description: `Read file: ${filePath}`,
      risk,
      preview: `File: ${filePath}\nSize: ${Math.round(fileSize / 1024)}KB${params.line_limit ? `\nLine limit: ${params.line_limit}` : ''}`
    };
  }

  /**
   * Execute the tool
   */
  static async execute(params: ReadFileParams): Promise<ToolResult> {
    try {
      // Validate parameters
      const validationError = this.validateParams(params);
      if (validationError) {
        return {
          success: false,
          content: validationError,
          displayResult: `❌ Validation failed: ${validationError}`,
          error: validationError
        };
      }

      // Convert relative paths to absolute
      const filePath = path.isAbsolute(params.file_path) 
        ? params.file_path 
        : path.resolve(process.cwd(), params.file_path);

      // Read file
      const fileContent = await fs.readFile(filePath, 'utf8');
      
      // Apply line limit if specified
      let displayContent = fileContent;
      let truncated = false;
      
      if (params.line_limit) {
        const lines = fileContent.split('\n');
        if (lines.length > params.line_limit) {
          displayContent = lines.slice(0, params.line_limit).join('\n');
          truncated = true;
        }
      }

      const relativePath = path.relative(process.cwd(), filePath);
      const truncationNote = truncated ? ` (truncated to ${params.line_limit} lines)` : '';
      
      return {
        success: true,
        content: displayContent,
        displayResult: `✅ Read file: ${relativePath}${truncationNote} (${fileContent.length} chars)`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Failed to read file: ${errorMessage}`,
        displayResult: `❌ Read failed: ${errorMessage}`,
        error: errorMessage
      };
    }
  }
}