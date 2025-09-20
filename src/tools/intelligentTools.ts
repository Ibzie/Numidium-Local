/**
 * Intelligent Development Tools
 * 
 * Advanced tool system that combines project analysis, intelligent code generation,
 * and multi-file operations to provide comprehensive development assistance.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContextAnalyzer, ProjectContext } from '../analysis/projectContext.js';
import { IntelligentCodeGenerator, GenerationRequest } from '../generation/codeGenerator.js';
import { MultiFileOperationManager, OperationRequest } from '../operations/multiFileOperations.js';
import { ToolResult } from './geminiStyleTools.js';

/**
 * Request for intelligent development operation
 */
export interface IntelligentRequest {
  /** Type of operation */
  type: 'analyze' | 'generate' | 'create-feature' | 'add-component' | 'build-api' | 'add-tests' | 'refactor' | 'document';
  /** Target or name */
  target: string;
  /** Detailed description */
  description: string;
  /** Additional parameters */
  parameters?: Record<string, any>;
}

/**
 * Result of intelligent operation with context
 */
export interface IntelligentResult extends ToolResult {
  /** Files that were created/modified */
  filesCreated: string[];
  /** Commands to run */
  suggestedCommands: string[];
  /** Project insights */
  insights?: string[];
}

/**
 * Intelligent development tool that understands your codebase
 */
export class IntelligentDevelopmentTool {
  private contextAnalyzer: ProjectContextAnalyzer;
  private codeGenerator: IntelligentCodeGenerator;
  private operationManager: MultiFileOperationManager;
  private contextCache: Map<string, { context: ProjectContext; timestamp: number }> = new Map();
  private readonly CONTEXT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.contextAnalyzer = new ProjectContextAnalyzer();
    this.codeGenerator = new IntelligentCodeGenerator();
    this.operationManager = new MultiFileOperationManager();
  }

  /**
   * Execute intelligent development request
   */
  async executeIntelligentRequest(request: IntelligentRequest, projectPath: string = process.cwd()): Promise<IntelligentResult> {
    try {
      // Get or analyze project context
      const context = await this.getProjectContext(projectPath);
      
      switch (request.type) {
        case 'analyze':
          return await this.analyzeProject(context);
        case 'generate':
          return await this.generateCode(request, context);
        case 'create-feature':
          return await this.createFeature(request, context);
        case 'add-component':
          return await this.addComponent(request, context);
        case 'build-api':
          return await this.buildApi(request, context);
        case 'add-tests':
          return await this.addTests(request, context);
        case 'document':
          return await this.generateDocumentation(request, context);
        default:
          throw new Error(`Unknown intelligent operation: ${request.type}`);
      }
    } catch (error) {
      throw new Error(`Intelligent operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get project context with caching
   */
  private async getProjectContext(projectPath: string): Promise<ProjectContext> {
    const absolutePath = path.resolve(projectPath);
    const cached = this.contextCache.get(absolutePath);
    
    if (cached && Date.now() - cached.timestamp < this.CONTEXT_CACHE_TTL) {
      return cached.context;
    }
    
    const context = await this.contextAnalyzer.analyzeProject(absolutePath);
    this.contextCache.set(absolutePath, { context, timestamp: Date.now() });
    
    return context;
  }

  /**
   * Analyze project and provide comprehensive insights
   */
  private async analyzeProject(context: ProjectContext): Promise<IntelligentResult> {
    const insights: string[] = [];
    
    // Analyze technology stack
    insights.push(`🚀 **Framework**: ${context.stack.framework} with ${context.stack.language}`);
    
    if (context.stack.buildTool) {
      insights.push(`🔧 **Build Tool**: ${context.stack.buildTool}`);
    }
    
    if (context.stack.testFramework) {
      insights.push(`🧪 **Testing**: ${context.stack.testFramework}`);
    } else {
      insights.push(`⚠️  **No testing framework detected** - Consider adding Jest or Vitest`);
    }
    
    // Analyze code style
    const style = context.style;
    insights.push(`✨ **Code Style**: ${style.indentation} (${style.indentSize}), ${style.quoteStyle} quotes, ${style.useSemicolons ? 'with' : 'without'} semicolons`);
    
    // Analyze project structure
    insights.push(`📁 **Organization**: ${context.structure.organizationStyle} based structure in \`${context.structure.sourceDir}/\``);
    
    // Analyze dependencies
    const heavyDeps = Object.entries(context.dependencies.dependencies)
      .filter(([_, info]) => info.usage === 'heavy')
      .map(([name]) => name);
    
    if (heavyDeps.length > 0) {
      insights.push(`📦 **Heavy Dependencies**: ${heavyDeps.join(', ')}`);
    }
    
    // Provide recommendations
    const recommendations: string[] = [];
    
    if (!context.stack.hasTypeScript && context.stack.framework === 'React') {
      recommendations.push('Consider migrating to TypeScript for better type safety');
    }
    
    if (!context.stack.linter) {
      recommendations.push('Add ESLint for code quality enforcement');
    }
    
    if (context.testing.setupPatterns.length === 0) {
      recommendations.push('Set up comprehensive testing suite');
    }
    
    if (recommendations.length > 0) {
      insights.push('', '💡 **Recommendations**:');
      recommendations.forEach(rec => insights.push(`   • ${rec}`));
    }
    
    return {
      success: true,
      content: `Project analysis completed for ${path.basename(context.rootPath)}`,
      displayResult: `✅ Analyzed project structure and dependencies\n\n${insights.join('\n')}`,
      filesCreated: [],
      suggestedCommands: [],
      insights
    };
  }

  /**
   * Generate code using intelligent templates
   */
  private async generateCode(request: IntelligentRequest, context: ProjectContext): Promise<IntelligentResult> {
    const generationRequest: GenerationRequest = {
      type: this.inferGenerationType(request.description),
      name: request.target,
      description: request.description,
      parameters: request.parameters
    };
    
    const result = this.codeGenerator.generateCode(generationRequest, context);
    
    // Create the main file
    await this.ensureDirectoryExists(path.dirname(result.filePath));
    await fs.writeFile(result.filePath, result.content, 'utf-8');
    
    const filesCreated = [result.filePath];
    
    // Create additional files
    for (const additionalFile of result.additionalFiles) {
      await this.ensureDirectoryExists(path.dirname(additionalFile.path));
      await fs.writeFile(additionalFile.path, additionalFile.content, 'utf-8');
      filesCreated.push(additionalFile.path);
    }
    
    // Handle imports to other files
    for (const importInfo of result.imports) {
      await this.addImportToFile(importInfo.filePath, importInfo.importStatement);
    }
    
    return {
      success: true,
      content: `Generated ${generationRequest.type} ${request.target}`,
      displayResult: `✅ Created ${request.target} with ${filesCreated.length} file(s):\n${filesCreated.map(f => `   • ${f}`).join('\n')}`,
      filesCreated,
      suggestedCommands: context.stack.linter ? [`${context.stack.packageManager} run lint --fix`] : []
    };
  }

  /**
   * Create complete feature with all supporting files
   */
  private async createFeature(request: IntelligentRequest, context: ProjectContext): Promise<IntelligentResult> {
    const operationRequest: OperationRequest = {
      type: 'feature',
      name: request.target,
      description: request.description,
      parameters: request.parameters
    };
    
    const operation = await this.operationManager.executeOperation(operationRequest, context);
    
    // Execute all file operations
    const filesCreated: string[] = [];
    for (const fileOp of operation.operations) {
      switch (fileOp.type) {
        case 'create':
          await this.ensureDirectoryExists(path.dirname(fileOp.filePath));
          await fs.writeFile(fileOp.filePath, fileOp.content || '', 'utf-8');
          filesCreated.push(fileOp.filePath);
          break;
        // Add other operation types as needed
      }
    }
    
    return {
      success: true,
      content: `Created ${request.target} feature with ${filesCreated.length} files`,
      displayResult: `✅ ${operation.description}\n\nFiles created:\n${filesCreated.map(f => `   • ${f}`).join('\n')}`,
      filesCreated,
      suggestedCommands: operation.postCommands || []
    };
  }

  /**
   * Add component with tests and documentation
   */
  private async addComponent(request: IntelligentRequest, context: ProjectContext): Promise<IntelligentResult> {
    const operationRequest: OperationRequest = {
      type: 'component-suite',
      name: request.target,
      description: request.description,
      parameters: request.parameters
    };
    
    const operation = await this.operationManager.executeOperation(operationRequest, context);
    
    // Execute all file operations
    const filesCreated: string[] = [];
    for (const fileOp of operation.operations) {
      if (fileOp.type === 'create') {
        await this.ensureDirectoryExists(path.dirname(fileOp.filePath));
        await fs.writeFile(fileOp.filePath, fileOp.content || '', 'utf-8');
        filesCreated.push(fileOp.filePath);
      }
    }
    
    return {
      success: true,
      content: `Added ${request.target} component suite`,
      displayResult: `✅ Created complete component suite for ${request.target}\n\nFiles created:\n${filesCreated.map(f => `   • ${f} (${this.getFilePurpose(f)})`).join('\n')}`,
      filesCreated,
      suggestedCommands: [`${context.stack.packageManager} run test`]
    };
  }

  /**
   * Build comprehensive API layer
   */
  private async buildApi(request: IntelligentRequest, context: ProjectContext): Promise<IntelligentResult> {
    const operationRequest: OperationRequest = {
      type: 'api-layer',
      name: request.target,
      description: request.description,
      parameters: request.parameters
    };
    
    const operation = await this.operationManager.executeOperation(operationRequest, context);
    
    // Execute all file operations
    const filesCreated: string[] = [];
    for (const fileOp of operation.operations) {
      if (fileOp.type === 'create') {
        await this.ensureDirectoryExists(path.dirname(fileOp.filePath));
        await fs.writeFile(fileOp.filePath, fileOp.content || '', 'utf-8');
        filesCreated.push(fileOp.filePath);
      }
    }
    
    const insights = [
      `Created comprehensive API layer for ${request.target}`,
      'Includes type definitions, service layer, and React hooks',
      'Ready for integration with your existing components'
    ];
    
    return {
      success: true,
      content: `Built API layer for ${request.target}`,
      displayResult: `✅ Created complete API implementation\n\nFiles created:\n${filesCreated.map(f => `   • ${f}`).join('\n')}\n\n💡 **Usage**: Import the hooks in your components for data fetching`,
      filesCreated,
      suggestedCommands: operation.postCommands || [],
      insights
    };
  }

  /**
   * Add comprehensive test suite
   */
  private async addTests(request: IntelligentRequest, context: ProjectContext): Promise<IntelligentResult> {
    const targetFiles = request.parameters?.files || [];
    
    if (targetFiles.length === 0) {
      throw new Error('No target files specified for testing');
    }
    
    const operationRequest: OperationRequest = {
      type: 'test-suite',
      name: request.target,
      description: request.description,
      parameters: { targetFiles }
    };
    
    const operation = await this.operationManager.executeOperation(operationRequest, context);
    
    // Execute all file operations
    const filesCreated: string[] = [];
    for (const fileOp of operation.operations) {
      if (fileOp.type === 'create') {
        await this.ensureDirectoryExists(path.dirname(fileOp.filePath));
        await fs.writeFile(fileOp.filePath, fileOp.content || '', 'utf-8');
        filesCreated.push(fileOp.filePath);
      }
    }
    
    return {
      success: true,
      content: `Added tests for ${targetFiles.length} files`,
      displayResult: `✅ Created test suite\n\nTest files created:\n${filesCreated.map(f => `   • ${f}`).join('\n')}`,
      filesCreated,
      suggestedCommands: operation.postCommands || []
    };
  }

  /**
   * Generate project documentation
   */
  private async generateDocumentation(request: IntelligentRequest, context: ProjectContext): Promise<IntelligentResult> {
    const operationRequest: OperationRequest = {
      type: 'documentation',
      name: request.target,
      description: request.description,
      parameters: request.parameters
    };
    
    const operation = await this.operationManager.executeOperation(operationRequest, context);
    
    // Execute all file operations
    const filesCreated: string[] = [];
    for (const fileOp of operation.operations) {
      if (fileOp.type === 'create') {
        await this.ensureDirectoryExists(path.dirname(fileOp.filePath));
        await fs.writeFile(fileOp.filePath, fileOp.content || '', 'utf-8');
        filesCreated.push(fileOp.filePath);
      }
    }
    
    return {
      success: true,
      content: `Generated documentation for ${request.target}`,
      displayResult: `✅ Created project documentation\n\nFiles created:\n${filesCreated.map(f => `   • ${f}`).join('\n')}`,
      filesCreated,
      suggestedCommands: []
    };
  }

  /**
   * Helper methods
   */

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private async addImportToFile(filePath: string, importStatement: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Find the last import line
      let lastImportIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ') || lines[i].startsWith('const ') && lines[i].includes('require(')) {
          lastImportIndex = i;
        }
      }
      
      // Insert the new import
      if (lastImportIndex >= 0) {
        lines.splice(lastImportIndex + 1, 0, importStatement);
      } else {
        lines.unshift(importStatement, '');
      }
      
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    } catch (error) {
      // File might not exist yet, ignore
    }
  }

  private inferGenerationType(description: string): GenerationRequest['type'] {
    const desc = description.toLowerCase();
    
    if (desc.includes('component')) return 'component';
    if (desc.includes('service') || desc.includes('api')) return 'service';
    if (desc.includes('type') || desc.includes('interface')) return 'type';
    if (desc.includes('hook')) return 'hook';
    if (desc.includes('test')) return 'test';
    
    return 'function';
  }

  private getFilePurpose(filePath: string): string {
    const fileName = path.basename(filePath);
    
    if (fileName.includes('.test.') || fileName.includes('.spec.')) return 'test';
    if (fileName.includes('.stories.')) return 'story';
    if (fileName.endsWith('.md')) return 'docs';
    if (fileName.endsWith('Service.ts') || fileName.endsWith('Service.js')) return 'service';
    if (fileName.endsWith('Api.ts') || fileName.endsWith('Api.js')) return 'api';
    if (fileName.startsWith('use') && (fileName.endsWith('.ts') || fileName.endsWith('.js'))) return 'hook';
    if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) return 'component';
    if (fileName.endsWith('index.ts') || fileName.endsWith('index.js')) return 'exports';
    
    return 'code';
  }
}