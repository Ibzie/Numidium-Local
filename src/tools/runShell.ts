/**
 * Shell command runner with safety features
 *
 * Executes shell commands but tries to prevent you from doing anything too stupid.
 * Has risk assessment because "rm -rf /" shouldn't be marked as "safe"
 */

import { spawn } from 'child_process';
import { ToolResult, ToolCallConfirmationDetails } from './toolRegistry.js';

export interface RunShellParams {
  /** The shell command to execute */
  command: string;
  /** Working directory for command execution */
  working_directory?: string;
  /** Timeout in milliseconds (default: 30000ms) */
  timeout?: number;
}

/**
 * Run Shell Command Tool following Gemini CLI patterns
 */
export class RunShellTool {
  static readonly name = 'run_shell_command';
  static readonly displayName = 'Run Shell Command';
  static readonly description = 'Executes a shell command in the local environment with proper timeout and error handling';

  /**
   * JSON Schema for function calling
   */
  static readonly schema = {
    name: 'run_shell_command',
    description: 'Executes a shell command in the local environment. Use with caution as commands have full system access.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (e.g., "ls -la", "npm install", "python script.py")'
        },
        working_directory: {
          type: 'string',
          description: 'Optional working directory for command execution (defaults to current directory)'
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in milliseconds (default: 30000ms, max: 300000ms)'
        }
      },
      required: ['command']
    }
  };

  /**
   * Validate parameters
   */
  static validateParams(params: RunShellParams): string | null {
    if (!params.command || params.command.trim() === '') {
      return 'Missing or empty "command"';
    }
    if (params.timeout !== undefined && (params.timeout < 1000 || params.timeout > 300000)) {
      return 'timeout must be between 1000ms and 300000ms (5 minutes)';
    }
    return null;
  }

  /**
   * Check if tool execution should be confirmed
   */
  static async shouldConfirmExecute(params: RunShellParams): Promise<ToolCallConfirmationDetails | false> {
    const command = params.command.trim();
    
    // Assess risk based on command content
    const risk = this.assessCommandRisk(command);
    
    return {
      toolName: this.displayName,
      params,
      description: `Execute shell command: ${command}`,
      risk,
      preview: `Command: ${command}${params.working_directory ? `\nDirectory: ${params.working_directory}` : ''}${params.timeout ? `\nTimeout: ${params.timeout}ms` : ''}`
    };
  }

  /**
   * Execute the tool
   */
  static async execute(params: RunShellParams): Promise<ToolResult> {
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

      const command = params.command.trim();
      const workingDirectory = params.working_directory || process.cwd();
      const timeout = params.timeout || 30000;

      const result = await this.executeCommand(command, workingDirectory, timeout);
      
      if (result.success) {
        return {
          success: true,
          content: result.stdout,
          displayResult: `✅ Command executed: ${command}\n${result.stdout}${result.stderr ? `\nWarnings: ${result.stderr}` : ''}`
        };
      } else {
        return {
          success: false,
          content: result.stderr || 'Command failed with no output',
          displayResult: `❌ Command failed: ${command}\n${result.stderr || 'No error output'}`,
          error: result.stderr || 'Command execution failed'
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Failed to execute command: ${errorMessage}`,
        displayResult: `❌ Execution failed: ${errorMessage}`,
        error: errorMessage
      };
    }
  }

  /**
   * Execute command with proper error handling and timeout
   */
  private static executeCommand(
    command: string, 
    workingDirectory: string, 
    timeout: number
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd: workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;

      // Set timeout
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          child.kill('SIGTERM');
          resolve({
            success: false,
            stdout,
            stderr: stderr + `\nCommand timed out after ${timeout}ms`,
            exitCode: null
          });
        }
      }, timeout);

      // Collect output
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      child.on('close', (code) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          resolve({
            success: code === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code
          });
        }
      });

      // Handle errors
      child.on('error', (error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          resolve({
            success: false,
            stdout,
            stderr: error.message,
            exitCode: null
          });
        }
      });
    });
  }

  /**
   * Assess command risk level
   */
  private static assessCommandRisk(command: string): 'safe' | 'moderate' | 'dangerous' {
    const lowerCommand = command.toLowerCase();
    
    // Dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf/,
      /sudo/,
      /chmod\s+777/,
      /dd\s+/,
      /mkfs/,
      /fdisk/,
      /format/,
      /del\s+\/s/,
      /shutdown/,
      /reboot/,
      /halt/
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(lowerCommand))) {
      return 'dangerous';
    }
    
    // Moderate risk commands
    const moderatePatterns = [
      /npm\s+install/,
      /pip\s+install/,
      /apt\s+install/,
      /yum\s+install/,
      /brew\s+install/,
      /chmod/,
      /chown/,
      /mkdir/,
      /cp\s+/,
      /mv\s+/,
      /git\s+/
    ];
    
    if (moderatePatterns.some(pattern => pattern.test(lowerCommand))) {
      return 'moderate';
    }
    
    return 'safe';
  }
}