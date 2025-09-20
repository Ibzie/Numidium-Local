/**
 * Version utilities for AI-CLI
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function getVersion(): Promise<string> {
  try {
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.1.0';
  } catch (error) {
    return '0.1.0';
  }
}