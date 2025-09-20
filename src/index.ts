#!/usr/bin/env node

/**
 * Main entry point for Numidium-Local
 *
 * Just fires up the terminal UI and handles CLI args.
 * Nothing fancy here, move along...
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

    program.parse(process.argv);
    const options = program.opts();

    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      program.help();
      return;
    }

    if (process.argv.includes('--version') || process.argv.includes('-V')) {
      console.log(await getVersion());
      return;
    }

    // Show a fancy startup message because why not
    console.log(chalk.blue('🚀 Starting Numidium-Local...'));
    console.log(chalk.gray('Press Ctrl+C or ESC to exit, "/" for commands'));

    // Dramatic pause for effect
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
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

// Handle graceful shutdown (because manners matter)
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Goodbye!'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});
main().catch((error) => {
  console.error(chalk.red('Critical error:'), error);
  process.exit(1);
});