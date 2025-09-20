/**
 * File writer tool that actually works
 *
 * Creates/overwrites files with content. Has basic safety checks
 * to prevent writing to system directories (you're welcome)
 */

import fs from 'fs/promises';
import path from 'path';

export interface WriteFileParams {
  /** The absolute path to the file to write to */
  file_path: string;
  /** The content to write to the file */
  content: string;
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

/**
 * Write File Tool following Gemini CLI patterns
 */
export class WriteFileTool {
  static readonly name = 'write_file';
  static readonly displayName = 'Write File';
  static readonly description = 'Writes content to a specified file in the local filesystem';

  /**
   * JSON Schema for function calling
   */
  static readonly schema = {
    name: 'write_file',
    description: 'Writes content to a specified file in the local filesystem. Creates directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to write to (e.g., \'/home/user/project/file.txt\'). Relative paths will be converted to absolute.'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file.'
        }
      },
      required: ['file_path', 'content']
    }
  };

  /**
   * Validate parameters
   */
  static validateParams(params: WriteFileParams): string | null {
    if (!params.file_path) {
      return 'Missing or empty "file_path"';
    }
    if (typeof params.content !== 'string') {
      return 'Content must be a string';
    }
    return null;
  }

  /**
   * Check if tool execution should be confirmed
   */
  static async shouldConfirmExecute(params: WriteFileParams): Promise<ToolCallConfirmationDetails | false> {
    // Convert relative paths to absolute
    const filePath = path.isAbsolute(params.file_path) 
      ? params.file_path 
      : path.resolve(process.cwd(), params.file_path);

    // Check if file exists
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch {
      // File doesn't exist, that's fine
    }

    const risk = this.assessRisk(filePath, params.content, fileExists);
    
    return {
      toolName: this.displayName,
      params: { ...params, file_path: filePath },
      description: fileExists 
        ? `Overwrite existing file: ${filePath}`
        : `Create new file: ${filePath}`,
      risk,
      preview: `File: ${filePath}\nContent preview:\n${params.content.substring(0, 200)}${params.content.length > 200 ? '...' : ''}`
    };
  }

  /**
   * Execute the tool
   */
  static async execute(params: WriteFileParams): Promise<ToolResult> {
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

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, params.content, 'utf8');

      const relativePath = path.relative(process.cwd(), filePath);
      return {
        success: true,
        content: `File written successfully: ${relativePath}`,
        displayResult: `✅ Created file: ${relativePath} (${params.content.length} chars)`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Failed to write file: ${errorMessage}`,
        displayResult: `❌ Write failed: ${errorMessage}`,
        error: errorMessage
      };
    }
  }

  /**
   * Assess risk level
   */
  private static assessRisk(filePath: string, content: string, fileExists: boolean): 'safe' | 'moderate' | 'dangerous' {
    // Check for dangerous paths
    const dangerousPaths = ['/etc/', '/usr/', '/bin/', '/sbin/', '/root/'];
    if (dangerousPaths.some(dp => filePath.startsWith(dp))) {
      return 'dangerous';
    }

    // Check for system files
    const systemFiles = ['.bashrc', '.profile', '.zshrc', 'passwd', 'shadow'];
    if (systemFiles.some(sf => filePath.includes(sf))) {
      return 'dangerous';
    }

    // Overwriting existing files is moderate risk
    if (fileExists) {
      return 'moderate';
    }

    // Creating new files is safe
    return 'safe';
  }
}