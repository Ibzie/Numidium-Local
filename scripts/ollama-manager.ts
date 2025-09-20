#!/usr/bin/env node

/**
 * Ollama API Manager Script
 * 
 * Professional Ollama service management following Claude Code patterns.
 * Handles starting, stopping, and managing Ollama API service.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

interface OllamaStatus {
  isRunning: boolean;
  pid?: number;
  port: number;
  host: string;
  uptime?: string;
  models: string[];
}

class OllamaManager {
  private host = 'http://localhost:11434';
  private port = 11434;

  /**
   * Check if Ollama service is running
   */
  async getStatus(): Promise<OllamaStatus> {
    try {
      const response = await fetch(`${this.host}/api/tags`);
      const data = await response.json();
      
      const models = data.models?.map((m: any) => m.name) || [];
      
      return {
        isRunning: true,
        port: this.port,
        host: this.host,
        models
      };
    } catch (error) {
      return {
        isRunning: false,
        port: this.port,
        host: this.host,
        models: []
      };
    }
  }

  /**
   * Start Ollama service
   */
  async start(): Promise<void> {
    console.log(chalk.blue('🚀 Starting Ollama service...'));
    
    const status = await this.getStatus();
    if (status.isRunning) {
      console.log(chalk.green('✅ Ollama is already running'));
      return;
    }

    return new Promise((resolve, reject) => {
      const ollama = spawn('ollama', ['serve'], {
        stdio: 'inherit',
        detached: true
      });

      ollama.unref();

      // Wait for service to be ready
      const checkReady = async () => {
        try {
          const response = await fetch(`${this.host}/`);
          if (response.ok) {
            console.log(chalk.green('✅ Ollama service started successfully'));
            resolve();
          } else {
            throw new Error('Service not ready');
          }
        } catch (error) {
          setTimeout(checkReady, 1000);
        }
      };

      setTimeout(checkReady, 2000);

      ollama.on('error', (error) => {
        console.error(chalk.red('❌ Failed to start Ollama:'), error.message);
        reject(error);
      });
    });
  }

  /**
   * Stop Ollama service
   */
  async stop(): Promise<void> {
    console.log(chalk.blue('⏹️  Stopping Ollama service...'));
    
    try {
      // Find Ollama process
      const { stdout } = await execAsync('pgrep -f "ollama serve"');
      const pids = stdout.trim().split('\n').filter(p => p);
      
      if (pids.length === 0) {
        console.log(chalk.yellow('⚠️  Ollama is not running'));
        return;
      }

      // Kill the processes
      for (const pid of pids) {
        await execAsync(`kill ${pid}`);
      }

      console.log(chalk.green('✅ Ollama service stopped'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Ollama was not running or already stopped'));
    }
  }

  /**
   * Restart Ollama service
   */
  async restart(): Promise<void> {
    console.log(chalk.blue('🔄 Restarting Ollama service...'));
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.start();
  }

  /**
   * List available models
   */
  async listModels(): Promise<void> {
    const status = await this.getStatus();
    
    if (!status.isRunning) {
      console.log(chalk.red('❌ Ollama is not running'));
      return;
    }

    console.log(chalk.blue('📋 Available models:'));
    if (status.models.length === 0) {
      console.log(chalk.yellow('  No models installed'));
      console.log(chalk.gray('  Install models with: ollama pull <model-name>'));
    } else {
      status.models.forEach(model => {
        console.log(chalk.green(`  • ${model}`));
      });
    }
  }

  /**
   * Pull a model
   */
  async pullModel(modelName: string): Promise<void> {
    console.log(chalk.blue(`📥 Pulling model: ${modelName}...`));
    
    return new Promise((resolve, reject) => {
      const pullProcess = spawn('ollama', ['pull', modelName], {
        stdio: 'inherit'
      });

      pullProcess.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green(`✅ Model ${modelName} pulled successfully`));
          resolve();
        } else {
          console.error(chalk.red(`❌ Failed to pull model ${modelName}`));
          reject(new Error(`Pull failed with code ${code}`));
        }
      });

      pullProcess.on('error', (error) => {
        console.error(chalk.red('❌ Failed to pull model:'), error.message);
        reject(error);
      });
    });
  }

  /**
   * Test connection to Ollama
   */
  async test(): Promise<void> {
    console.log(chalk.blue('🧪 Testing Ollama connection...'));
    
    const status = await this.getStatus();
    
    if (!status.isRunning) {
      console.log(chalk.red('❌ Ollama is not running'));
      console.log(chalk.gray('  Start with: npm run ollama:start'));
      return;
    }

    console.log(chalk.green('✅ Ollama is running'));
    console.log(chalk.gray(`   Host: ${status.host}`));
    console.log(chalk.gray(`   Models: ${status.models.length} available`));

    // Test a simple generation if models are available
    if (status.models.length > 0) {
      console.log(chalk.blue('🧪 Testing generation...'));
      try {
        const response = await fetch(`${this.host}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: status.models[0],
            prompt: 'Say hello',
            stream: false
          })
        });

        if (response.ok) {
          console.log(chalk.green('✅ Generation test passed'));
        } else {
          console.log(chalk.yellow('⚠️  Generation test failed'));
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️  Generation test error'));
      }
    }
  }

  /**
   * Show status
   */
  async status(): Promise<void> {
    const status = await this.getStatus();
    
    console.log(chalk.blue('📊 Ollama Status:'));
    console.log(`  Running: ${status.isRunning ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
    console.log(`  Host: ${chalk.gray(status.host)}`);
    console.log(`  Port: ${chalk.gray(status.port.toString())}`);
    console.log(`  Models: ${chalk.gray(status.models.length.toString())} available`);
    
    if (status.models.length > 0) {
      console.log(chalk.blue('   Available models:'));
      status.models.forEach(model => {
        console.log(`     • ${chalk.green(model)}`);
      });
    }
  }
}

// CLI Interface
async function main() {
  const manager = new OllamaManager();
  const command = process.argv[2];

  try {
    switch (command) {
      case 'start':
        await manager.start();
        break;
      case 'stop':
        await manager.stop();
        break;
      case 'restart':
        await manager.restart();
        break;
      case 'status':
        await manager.status();
        break;
      case 'test':
        await manager.test();
        break;
      case 'models':
        await manager.listModels();
        break;
      case 'pull':
        const modelName = process.argv[3];
        if (!modelName) {
          console.error(chalk.red('❌ Please specify a model name'));
          console.log(chalk.gray('   Usage: npm run ollama:pull <model-name>'));
          process.exit(1);
        }
        await manager.pullModel(modelName);
        break;
      default:
        console.log(chalk.blue('Ollama Manager - Professional API Management'));
        console.log();
        console.log('Available commands:');
        console.log('  start    - Start Ollama service');
        console.log('  stop     - Stop Ollama service');
        console.log('  restart  - Restart Ollama service');
        console.log('  status   - Show service status');
        console.log('  test     - Test connection and generation');
        console.log('  models   - List available models');
        console.log('  pull     - Pull a model (requires model name)');
        console.log();
        console.log('Usage: npm run ollama:<command>');
    }
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ES Module entry point check
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { OllamaManager };