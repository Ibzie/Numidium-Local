/**
 * Directory lister - shows what's in a folder
 *
 * Like ls but with better formatting and file size info
 */

import fs from 'fs/promises';
import path from 'path';
import { ToolResult, ToolCallConfirmationDetails } from './toolRegistry.js';

export interface ListDirectoryParams {
  /** The absolute path to the directory to list */
  directory_path: string;
  /** Show hidden files (starting with .) */
  show_hidden?: boolean;
  /** Show detailed information (size, permissions, etc.) */
  detailed?: boolean;
}

/**
 * List Directory Tool following Gemini CLI patterns
 */
export class ListDirectoryTool {
  static readonly name = 'list_directory';
  static readonly displayName = 'List Directory';
  static readonly description = 'Lists files and directories in a specified directory path';

  /**
   * JSON Schema for function calling
   */
  static readonly schema = {
    name: 'list_directory',
    description: 'Lists files and directories in a specified directory path. Useful for exploring project structure.',
    parameters: {
      type: 'object',
      properties: {
        directory_path: {
          type: 'string',
          description: 'The absolute path to the directory to list (e.g., \'/home/user/project\'). Relative paths will be converted to absolute.'
        },
        show_hidden: {
          type: 'boolean',
          description: 'Whether to show hidden files and directories (starting with .)'
        },
        detailed: {
          type: 'boolean',
          description: 'Whether to show detailed information including file sizes and permissions'
        }
      },
      required: ['directory_path']
    }
  };

  /**
   * Validate parameters
   */
  static validateParams(params: ListDirectoryParams): string | null {
    if (!params.directory_path) {
      return 'Missing or empty "directory_path"';
    }
    return null;
  }

  /**
   * Check if tool execution should be confirmed
   */
  static async shouldConfirmExecute(params: ListDirectoryParams): Promise<ToolCallConfirmationDetails | false> {
    // Convert relative paths to absolute
    const dirPath = path.isAbsolute(params.directory_path) 
      ? params.directory_path 
      : path.resolve(process.cwd(), params.directory_path);

    // Check if directory exists
    let dirExists = false;
    try {
      const stats = await fs.stat(dirPath);
      dirExists = stats.isDirectory();
    } catch {
      // Directory doesn't exist or not accessible
    }

    if (!dirExists) {
      return false; // No confirmation needed for non-existent directories
    }

    return {
      toolName: this.displayName,
      params: { ...params, directory_path: dirPath },
      description: `List directory contents: ${dirPath}`,
      risk: 'safe', // Directory listing is always safe
      preview: `Directory: ${dirPath}${params.show_hidden ? '\nShow hidden files: Yes' : ''}${params.detailed ? '\nDetailed view: Yes' : ''}`
    };
  }

  /**
   * Execute the tool
   */
  static async execute(params: ListDirectoryParams): Promise<ToolResult> {
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
      const dirPath = path.isAbsolute(params.directory_path) 
        ? params.directory_path 
        : path.resolve(process.cwd(), params.directory_path);

      // Check if directory exists and is accessible
      const dirStats = await fs.stat(dirPath);
      if (!dirStats.isDirectory()) {
        return {
          success: false,
          content: 'Path is not a directory',
          displayResult: `❌ Not a directory: ${dirPath}`,
          error: 'Path is not a directory'
        };
      }

      // Read directory contents
      const entries = await fs.readdir(dirPath);
      
      // Filter hidden files if requested
      const filteredEntries = params.show_hidden 
        ? entries 
        : entries.filter(entry => !entry.startsWith('.'));

      if (filteredEntries.length === 0) {
        const relativePath = path.relative(process.cwd(), dirPath);
        return {
          success: true,
          content: 'Directory is empty',
          displayResult: `✅ Listed directory: ${relativePath} (empty)`
        };
      }

      // Get detailed info if requested
      let output: string;
      if (params.detailed) {
        const detailedEntries = await Promise.all(
          filteredEntries.map(async (entry) => {
            try {
              const entryPath = path.join(dirPath, entry);
              const stats = await fs.stat(entryPath);
              const size = stats.isDirectory() ? '<DIR>' : this.formatFileSize(stats.size);
              const type = stats.isDirectory() ? 'directory' : 'file';
              const modified = stats.mtime.toISOString().split('T')[0];
              return `${type.padEnd(9)} ${size.padEnd(10)} ${modified} ${entry}`;
            } catch {
              return `unknown   <ERROR>    <ERROR>    ${entry}`;
            }
          })
        );
        
        output = [
          'Type      Size       Modified   Name',
          '─'.repeat(50),
          ...detailedEntries
        ].join('\n');
      } else {
        // Simple listing
        const directories = [];
        const files = [];
        
        for (const entry of filteredEntries) {
          try {
            const entryPath = path.join(dirPath, entry);
            const stats = await fs.stat(entryPath);
            if (stats.isDirectory()) {
              directories.push(entry + '/');
            } else {
              files.push(entry);
            }
          } catch {
            files.push(entry); // Treat as file if can't determine
          }
        }
        
        const sortedEntries = [...directories.sort(), ...files.sort()];
        output = sortedEntries.join('\n');
      }

      const relativePath = path.relative(process.cwd(), dirPath);
      return {
        success: true,
        content: output,
        displayResult: `✅ Listed directory: ${relativePath} (${filteredEntries.length} items)`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Failed to list directory: ${errorMessage}`,
        displayResult: `❌ List failed: ${errorMessage}`,
        error: errorMessage
      };
    }
  }

  /**
   * Format file size in human-readable format
   */
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}