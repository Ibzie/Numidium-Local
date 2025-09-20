/**
 * Project Context Analysis System
 * 
 * Analyzes codebases to understand structure, patterns, and development environment.
 * Provides AI with comprehensive project understanding for intelligent code generation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Represents the development framework and tools used in a project
 */
export interface TechnologyStack {
  /** Primary framework (React, Vue, Express, etc.) */
  framework: string;
  /** Language and version */
  language: string;
  /** Build tools (Vite, Webpack, etc.) */
  buildTool?: string;
  /** Testing framework */
  testFramework?: string;
  /** Package manager */
  packageManager: string;
  /** TypeScript configuration if present */
  hasTypeScript: boolean;
  /** Linting setup */
  linter?: string;
}

/**
 * Code style patterns extracted from existing codebase
 */
export interface CodeStyleGuide {
  /** Indentation style */
  indentation: 'tabs' | 'spaces';
  /** Number of spaces for indentation */
  indentSize: number;
  /** Quote style preference */
  quoteStyle: 'single' | 'double';
  /** Semicolon usage */
  useSemicolons: boolean;
  /** Import statement patterns */
  importStyle: 'named' | 'default' | 'mixed';
  /** Function declaration style */
  functionStyle: 'arrow' | 'function' | 'mixed';
}

/**
 * Test patterns and conventions found in codebase
 */
export interface TestPatterns {
  /** Test file naming pattern */
  namingPattern: string;
  /** Test file location strategy */
  location: 'alongside' | 'separate' | 'mixed';
  /** Common test utilities and setup */
  setupPatterns: string[];
  /** Mock patterns */
  mockingStyle?: string;
}

/**
 * Project file organization structure
 */
export interface ProjectStructure {
  /** Source code directory */
  sourceDir: string;
  /** Test directory (if separate) */
  testDir?: string;
  /** Main entry points */
  entryPoints: string[];
  /** Component/module organization pattern */
  organizationStyle: 'feature' | 'type' | 'mixed';
  /** Common directory patterns */
  directoryPatterns: Record<string, string>;
}

/**
 * Dependency relationships and usage patterns
 */
export interface DependencyGraph {
  /** Direct dependencies with usage frequency */
  dependencies: Record<string, { version: string; usage: 'heavy' | 'moderate' | 'light' }>;
  /** Dev dependencies */
  devDependencies: Record<string, string>;
  /** Internal module dependencies */
  internalDeps: Record<string, string[]>;
}

/**
 * Complete project context for AI understanding
 */
export interface ProjectContext {
  /** Project root directory */
  rootPath: string;
  /** Technology stack analysis */
  stack: TechnologyStack;
  /** Code style patterns */
  style: CodeStyleGuide;
  /** Testing patterns */
  testing: TestPatterns;
  /** File organization structure */
  structure: ProjectStructure;
  /** Dependency analysis */
  dependencies: DependencyGraph;
  /** Analysis timestamp */
  analyzedAt: Date;
}

/**
 * Analyzes a project directory to build comprehensive context
 */
export class ProjectContextAnalyzer {
  
  /**
   * Analyze project at given path and build complete context
   */
  async analyzeProject(projectPath: string): Promise<ProjectContext> {
    const absolutePath = path.resolve(projectPath);
    
    // Verify project directory exists
    try {
      await fs.access(absolutePath);
    } catch (error) {
      throw new Error(`Project directory not found: ${absolutePath}`);
    }

    const [
      stack,
      style, 
      testing,
      structure,
      dependencies
    ] = await Promise.all([
      this.analyzeTechnologyStack(absolutePath),
      this.analyzeCodeStyle(absolutePath),
      this.analyzeTestPatterns(absolutePath),
      this.analyzeProjectStructure(absolutePath),
      this.analyzeDependencies(absolutePath)
    ]);

    return {
      rootPath: absolutePath,
      stack,
      style,
      testing,
      structure,
      dependencies,
      analyzedAt: new Date()
    };
  }

  /**
   * Analyze technology stack from package.json and config files
   */
  private async analyzeTechnologyStack(projectPath: string): Promise<TechnologyStack> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Detect framework
      let framework = 'Unknown';
      if (deps.react) framework = 'React';
      else if (deps.vue) framework = 'Vue';
      else if (deps.express) framework = 'Express';
      else if (deps['@nestjs/core']) framework = 'NestJS';
      else if (deps.next) framework = 'Next.js';

      // Detect build tool
      let buildTool: string | undefined;
      if (deps.vite) buildTool = 'Vite';
      else if (deps.webpack) buildTool = 'Webpack';
      else if (deps.parcel) buildTool = 'Parcel';

      // Detect test framework
      let testFramework: string | undefined;
      if (deps.vitest) testFramework = 'Vitest';
      else if (deps.jest) testFramework = 'Jest';
      else if (deps.mocha) testFramework = 'Mocha';

      // Detect package manager
      let packageManager = 'npm';
      try {
        await fs.access(path.join(projectPath, 'yarn.lock'));
        packageManager = 'yarn';
      } catch {
        try {
          await fs.access(path.join(projectPath, 'pnpm-lock.yaml'));
          packageManager = 'pnpm';
        } catch {
          // Default to npm
        }
      }

      // Check TypeScript
      const hasTypeScript = !!(deps.typescript || 
        await fs.access(path.join(projectPath, 'tsconfig.json')).then(() => true).catch(() => false));

      // Detect linter
      let linter: string | undefined;
      if (deps.eslint) linter = 'ESLint';

      return {
        framework,
        language: hasTypeScript ? 'TypeScript' : 'JavaScript',
        buildTool,
        testFramework,
        packageManager,
        hasTypeScript,
        linter
      };
    } catch (error) {
      throw new Error(`Failed to analyze technology stack: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Analyze code style patterns from existing source files
   */
  private async analyzeCodeStyle(projectPath: string): Promise<CodeStyleGuide> {
    const sourceFiles = await this.findSourceFiles(projectPath);
    
    if (sourceFiles.length === 0) {
      // Default style if no source files found
      return {
        indentation: 'spaces',
        indentSize: 2,
        quoteStyle: 'single',
        useSemicolons: true,
        importStyle: 'named',
        functionStyle: 'arrow'
      };
    }

    // Analyze first few files for patterns
    const sampleFiles = sourceFiles.slice(0, Math.min(10, sourceFiles.length));
    const samples = await Promise.all(
      sampleFiles.map(async file => {
        try {
          return await fs.readFile(file, 'utf-8');
        } catch {
          return '';
        }
      })
    );

    const combinedContent = samples.join('\n');

    // Analyze indentation
    const tabCount = (combinedContent.match(/^\t/gm) || []).length;
    const spaceCount = (combinedContent.match(/^  /gm) || []).length;
    const indentation = tabCount > spaceCount ? 'tabs' : 'spaces';
    
    // Analyze indent size (for spaces)
    let indentSize = 2;
    if (indentation === 'spaces') {
      const fourSpaceMatches = (combinedContent.match(/^    /gm) || []).length;
      if (fourSpaceMatches > spaceCount * 0.5) indentSize = 4;
    }

    // Analyze quote style
    const singleQuotes = (combinedContent.match(/'/g) || []).length;
    const doubleQuotes = (combinedContent.match(/"/g) || []).length;
    const quoteStyle = singleQuotes > doubleQuotes ? 'single' : 'double';

    // Analyze semicolons
    const withSemicolons = (combinedContent.match(/;$/gm) || []).length;
    const withoutSemicolons = (combinedContent.match(/[^;]$/gm) || []).length;
    const useSemicolons = withSemicolons > withoutSemicolons * 0.5;

    // Analyze import style
    const namedImports = (combinedContent.match(/import\s*{/g) || []).length;
    const defaultImports = (combinedContent.match(/import\s+\w+\s+from/g) || []).length;
    let importStyle: 'named' | 'default' | 'mixed' = 'mixed';
    if (namedImports > defaultImports * 2) importStyle = 'named';
    else if (defaultImports > namedImports * 2) importStyle = 'default';

    // Analyze function style
    const arrowFunctions = (combinedContent.match(/\w+\s*=\s*\(/g) || []).length;
    const regularFunctions = (combinedContent.match(/function\s+\w+/g) || []).length;
    let functionStyle: 'arrow' | 'function' | 'mixed' = 'mixed';
    if (arrowFunctions > regularFunctions * 2) functionStyle = 'arrow';
    else if (regularFunctions > arrowFunctions * 2) functionStyle = 'function';

    return {
      indentation,
      indentSize,
      quoteStyle,
      useSemicolons,
      importStyle,
      functionStyle
    };
  }

  /**
   * Analyze testing patterns and conventions
   */
  private async analyzeTestPatterns(projectPath: string): Promise<TestPatterns> {
    const testFiles = await this.findTestFiles(projectPath);
    
    if (testFiles.length === 0) {
      return {
        namingPattern: '*.test.*',
        location: 'alongside',
        setupPatterns: []
      };
    }

    // Analyze naming patterns
    const hasTestSuffix = testFiles.some(f => f.includes('.test.'));
    const hasSpecSuffix = testFiles.some(f => f.includes('.spec.'));
    let namingPattern = '*.test.*';
    if (hasSpecSuffix && !hasTestSuffix) namingPattern = '*.spec.*';
    else if (hasSpecSuffix && hasTestSuffix) namingPattern = '*.{test,spec}.*';

    // Analyze location strategy
    const sourceFiles = await this.findSourceFiles(projectPath);
    let location: 'alongside' | 'separate' | 'mixed' = 'alongside';
    
    if (testFiles.every(tf => tf.includes('/test/') || tf.includes('/__tests__/'))) {
      location = 'separate';
    } else if (testFiles.some(tf => tf.includes('/test/') || tf.includes('/__tests__/'))) {
      location = 'mixed';
    }

    // Analyze setup patterns from test files
    const setupPatterns: string[] = [];
    try {
      const sampleTestFile = testFiles[0];
      const content = await fs.readFile(sampleTestFile, 'utf-8');
      
      if (content.includes('beforeEach')) setupPatterns.push('beforeEach');
      if (content.includes('beforeAll')) setupPatterns.push('beforeAll');
      if (content.includes('describe')) setupPatterns.push('describe blocks');
      if (content.includes('it(') || content.includes('test(')) setupPatterns.push('individual tests');
    } catch {
      // Ignore if can't read test file
    }

    return {
      namingPattern,
      location,
      setupPatterns
    };
  }

  /**
   * Analyze project structure and organization patterns
   */
  private async analyzeProjectStructure(projectPath: string): Promise<ProjectStructure> {
    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      const dirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

      // Identify source directory
      let sourceDir = 'src';
      if (dirs.includes('src')) sourceDir = 'src';
      else if (dirs.includes('app')) sourceDir = 'app';
      else if (dirs.includes('lib')) sourceDir = 'lib';
      else sourceDir = '.';

      // Identify test directory
      let testDir: string | undefined;
      if (dirs.includes('test')) testDir = 'test';
      else if (dirs.includes('tests')) testDir = 'tests';
      else if (dirs.includes('__tests__')) testDir = '__tests__';

      // Find entry points
      const entryPoints: string[] = [];
      const possibleEntries = ['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts'];
      for (const entry of possibleEntries) {
        try {
          await fs.access(path.join(projectPath, sourceDir, entry));
          entryPoints.push(path.join(sourceDir, entry));
        } catch {
          // Entry point doesn't exist
        }
      }

      // Analyze organization style by looking at source structure
      let organizationStyle: 'feature' | 'type' | 'mixed' = 'type';
      try {
        const srcPath = path.join(projectPath, sourceDir);
        const srcEntries = await fs.readdir(srcPath, { withFileTypes: true });
        const srcDirs = srcEntries.filter(entry => entry.isDirectory()).map(entry => entry.name);
        
        const typeBasedDirs = ['components', 'services', 'utils', 'types', 'hooks'];
        const hasTypeBased = typeBasedDirs.some(dir => srcDirs.includes(dir));
        
        if (!hasTypeBased && srcDirs.length > 2) {
          organizationStyle = 'feature';
        }
      } catch {
        // Can't analyze source structure
      }

      // Common directory patterns
      const directoryPatterns: Record<string, string> = {};
      for (const dir of dirs) {
        if (dir === 'src' || dir === 'app') directoryPatterns.source = dir;
        else if (dir === 'public' || dir === 'static') directoryPatterns.assets = dir;
        else if (dir === 'docs' || dir === 'documentation') directoryPatterns.docs = dir;
        else if (dir === 'scripts' || dir === 'tools') directoryPatterns.scripts = dir;
      }

      return {
        sourceDir,
        testDir,
        entryPoints,
        organizationStyle,
        directoryPatterns
      };
    } catch (error) {
      throw new Error(`Failed to analyze project structure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Analyze dependencies and their usage patterns
   */
  private async analyzeDependencies(projectPath: string): Promise<DependencyGraph> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      const dependencies = packageJson.dependencies || {};
      const devDependencies = packageJson.devDependencies || {};

      // Analyze usage frequency by scanning imports
      const sourceFiles = await this.findSourceFiles(projectPath);
      const usageMap: Record<string, number> = {};

      for (const file of sourceFiles.slice(0, 20)) { // Sample first 20 files
        try {
          const content = await fs.readFile(file, 'utf-8');
          const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
          
          imports.forEach(imp => {
            const module = imp.match(/from\s+['"]([^'"]+)['"]/)?.[1];
            if (module && dependencies[module]) {
              usageMap[module] = (usageMap[module] || 0) + 1;
            }
          });
        } catch {
          // Skip files that can't be read
        }
      }

      // Categorize usage frequency
      const dependenciesWithUsage: Record<string, { version: string; usage: 'heavy' | 'moderate' | 'light' }> = {};
      const maxUsage = Math.max(...Object.values(usageMap));
      
      Object.entries(dependencies).forEach(([name, version]) => {
        const usage = usageMap[name] || 0;
        let category: 'heavy' | 'moderate' | 'light' = 'light';
        
        if (usage > maxUsage * 0.6) category = 'heavy';
        else if (usage > maxUsage * 0.2) category = 'moderate';
        
        dependenciesWithUsage[name] = { version: version as string, usage: category };
      });

      return {
        dependencies: dependenciesWithUsage,
        devDependencies,
        internalDeps: {} // TODO: Analyze internal module dependencies
      };
    } catch (error) {
      throw new Error(`Failed to analyze dependencies: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find all source files in project
   */
  private async findSourceFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.vue'];
    
    async function scanDirectory(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Skip common ignore directories
            if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            if (extensions.some(ext => entry.name.endsWith(ext))) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories we can't access
      }
    }

    await scanDirectory(projectPath);
    return files;
  }

  /**
   * Find all test files in project
   */
  private async findTestFiles(projectPath: string): Promise<string[]> {
    const sourceFiles = await this.findSourceFiles(projectPath);
    return sourceFiles.filter(file => 
      file.includes('.test.') || 
      file.includes('.spec.') ||
      file.includes('/__tests__/') ||
      file.includes('/test/')
    );
  }
}