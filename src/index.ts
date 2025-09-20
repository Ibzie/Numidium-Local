#!/usr/bin/env node

/**
 * Numidium-Local - Your Local AI Development Agent
 *
 * A persistent interactive terminal application powered by Ollama.
 * Provides Claude Code-like experience with local AI models.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import App from './ui/App.js';
import { getVersion } from './utils/version.js';

const program = new Command();

async function main() {
  try {
    program
      .name('numidium-local')
      .description('Numidium-Local - Your Local AI Development Agent')
      .version(await getVersion())
      .option('-m, --model <model>', 'specify Ollama model to use', 'qwen3:latest')
      .option('-v, --verbose', 'enable verbose output')
      .option('--debug', 'enable debug mode');

    // Parse arguments first
    program.parse(process.argv);
    const options = program.opts();

    // Check for help or version flags
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      program.help();
      return;
    }

    if (process.argv.includes('--version') || process.argv.includes('-V')) {
      console.log(await getVersion());
      return;
    }

    // Start the interactive UI
    console.log(chalk.blue('🚀 Starting Numidium-Local...'));
    console.log(chalk.gray('Press Ctrl+C or ESC to exit, "/" for commands'));
    
    // Small delay to show startup message
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we can run in interactive mode
    try {
      // Render the React UI
      render(React.createElement(App));
    } catch (error) {
      console.error(chalk.red('Interactive mode not supported in this environment.'));
      console.log(chalk.yellow('Please run Numidium-Local in a proper terminal for the full interactive experience.'));
      console.log(chalk.gray('Current limitations: Raw mode input not available'));
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    
    if (program.opts().debug) {
      console.error(chalk.gray('Stack trace:'), error);
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Goodbye!'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Run the CLI
main().catch((error) => {
  console.error(chalk.red('Critical error:'), error);
  process.exit(1);
});