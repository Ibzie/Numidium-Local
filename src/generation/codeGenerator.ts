/**
 * Intelligent Code Generation System
 * 
 * Generates code that matches existing project patterns, style, and conventions.
 * Uses project context to create consistent, production-ready code.
 */

import { ProjectContext } from '../analysis/projectContext.js';

/**
 * Code generation request with context
 */
export interface GenerationRequest {
  /** Type of code to generate */
  type: 'component' | 'function' | 'test' | 'type' | 'service' | 'hook';
  /** Name of the code element */
  name: string;
  /** Purpose/description */
  description: string;
  /** Target file path (optional - will be inferred) */
  targetPath?: string;
  /** Additional parameters specific to generation type */
  parameters?: Record<string, any>;
}

/**
 * Generated code result
 */
export interface GenerationResult {
  /** Generated code content */
  content: string;
  /** Suggested file path */
  filePath: string;
  /** Additional files to create (tests, types, etc.) */
  additionalFiles: Array<{
    path: string;
    content: string;
    purpose: string;
  }>;
  /** Import statements to add to other files */
  imports: Array<{
    filePath: string;
    importStatement: string;
  }>;
}

/**
 * Template for different code generation types
 */
interface CodeTemplate {
  /** Generate the main code content */
  generate(request: GenerationRequest, context: ProjectContext): string;
  /** Determine appropriate file path */
  getFilePath(request: GenerationRequest, context: ProjectContext): string;
  /** Generate additional files (tests, etc.) */
  getAdditionalFiles?(request: GenerationRequest, context: ProjectContext): GenerationResult['additionalFiles'];
  /** Generate import statements for other files */
  getImports?(request: GenerationRequest, context: ProjectContext): GenerationResult['imports'];
}

/**
 * Intelligent code generator that matches project patterns
 */
export class IntelligentCodeGenerator {
  private templates: Map<string, CodeTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  /**
   * Generate code based on request and project context
   */
  generateCode(request: GenerationRequest, context: ProjectContext): GenerationResult {
    const template = this.templates.get(request.type);
    if (!template) {
      throw new Error(`No template found for generation type: ${request.type}`);
    }

    const content = template.generate(request, context);
    const filePath = request.targetPath || template.getFilePath(request, context);
    const additionalFiles = template.getAdditionalFiles?.(request, context) || [];
    const imports = template.getImports?.(request, context) || [];

    return {
      content,
      filePath,
      additionalFiles,
      imports
    };
  }

  /**
   * Register a custom code generation template
   */
  registerTemplate(type: string, template: CodeTemplate): void {
    this.templates.set(type, template);
  }

  /**
   * Register built-in templates for common code generation patterns
   */
  private registerDefaultTemplates(): void {
    
    // React Component Template
    this.templates.set('component', {
      generate: (request, context) => {
        const { name } = request;
        const { style, stack } = context;
        const props = request.parameters?.props || [];
        
        // Build component based on project style
        const indent = style.indentation === 'tabs' ? '\t' : ' '.repeat(style.indentSize);
        const quote = style.quoteStyle === 'single' ? "'" : '"';
        const semi = style.useSemicolons ? ';' : '';
        
        // Generate props interface if TypeScript
        let propsInterface = '';
        if (stack.hasTypeScript && props.length > 0) {
          propsInterface = `interface ${name}Props {\n`;
          props.forEach((prop: any) => {
            propsInterface += `${indent}${prop.name}: ${prop.type}${semi}\n`;
          });
          propsInterface += `}\n\n`;
        }

        // Generate component function
        const propsParam = stack.hasTypeScript && props.length > 0 ? `props: ${name}Props` : 'props';
        
        let component = '';
        if (style.functionStyle === 'arrow' || style.functionStyle === 'mixed') {
          component = `export const ${name} = (${propsParam}) => {\n`;
        } else {
          component = `export function ${name}(${propsParam}) {\n`;
        }
        
        component += `${indent}return (\n`;
        component += `${indent}${indent}<div>\n`;
        component += `${indent}${indent}${indent}<h1>${name} Component</h1>\n`;
        component += `${indent}${indent}</div>\n`;
        component += `${indent})${semi}\n`;
        component += style.functionStyle === 'arrow' || style.functionStyle === 'mixed' ? `}${semi}` : `}`;

        // Build imports
        let imports = '';
        if (stack.framework === 'React') {
          if (style.importStyle === 'named') {
            imports = `import { FC } from ${quote}react${quote}${semi}\n\n`;
          } else {
            imports = `import React from ${quote}react${quote}${semi}\n\n`;
          }
        }

        return imports + propsInterface + component;
      },

      getFilePath: (request, context) => {
        const { name } = request;
        const { structure } = context;
        const ext = context.stack.hasTypeScript ? '.tsx' : '.jsx';
        
        if (structure.organizationStyle === 'feature') {
          return `${structure.sourceDir}/components/${name}/${name}${ext}`;
        } else {
          return `${structure.sourceDir}/components/${name}${ext}`;
        }
      },

      getAdditionalFiles: (request, context) => {
        const { name } = request;
        const files: GenerationResult['additionalFiles'] = [];
        
        // Generate test file
        if (context.testing.namingPattern) {
          const testExt = context.stack.hasTypeScript ? '.tsx' : '.jsx';
          const testPattern = context.testing.namingPattern.replace('*', name);
          
          let testPath: string;
          if (context.testing.location === 'separate' && context.structure.testDir) {
            testPath = `${context.structure.testDir}/components/${testPattern}${testExt}`;
          } else {
            testPath = `${context.structure.sourceDir}/components/${testPattern}${testExt}`;
          }

          const testContent = this.generateComponentTest(name, context);
          files.push({
            path: testPath,
            content: testContent,
            purpose: 'Unit tests'
          });
        }

        // Generate index file for feature-based organization
        if (context.structure.organizationStyle === 'feature') {
          const indexContent = `export { ${name} } from './${name}'${context.style.useSemicolons ? ';' : ''}\n`;
          files.push({
            path: `${context.structure.sourceDir}/components/${name}/index${context.stack.hasTypeScript ? '.ts' : '.js'}`,
            content: indexContent,
            purpose: 'Re-export index'
          });
        }

        return files;
      }
    });

    // TypeScript Type/Interface Template
    this.templates.set('type', {
      generate: (request, context) => {
        const { name, description } = request;
        const { style } = context;
        const fields = request.parameters?.fields || [];
        
        const semi = style.useSemicolons ? ';' : '';
        const indent = style.indentation === 'tabs' ? '\t' : ' '.repeat(style.indentSize);
        
        let typeDefinition = `/**\n * ${description}\n */\n`;
        typeDefinition += `export interface ${name} {\n`;
        
        fields.forEach((field: any) => {
          if (field.description) {
            typeDefinition += `${indent}/** ${field.description} */\n`;
          }
          const optional = field.optional ? '?' : '';
          typeDefinition += `${indent}${field.name}${optional}: ${field.type}${semi}\n`;
        });
        
        typeDefinition += `}`;
        
        return typeDefinition;
      },

      getFilePath: (request, context) => {
        const { name } = request;
        const { structure } = context;
        return `${structure.sourceDir}/types/${name}.ts`;
      }
    });

    // Service/API Layer Template  
    this.templates.set('service', {
      generate: (request, context) => {
        const { name, description } = request;
        const { style, dependencies } = context;
        
        const semi = style.useSemicolons ? ';' : '';
        const quote = style.quoteStyle === 'single' ? "'" : '"';
        const indent = style.indentation === 'tabs' ? '\t' : ' '.repeat(style.indentSize);
        
        // Check if axios is available
        const hasAxios = dependencies.dependencies.axios;
        
        let imports = '';
        if (hasAxios) {
          imports = `import axios from ${quote}axios${quote}${semi}\n\n`;
        }
        
        let service = `/**\n * ${description}\n */\n`;
        service += `export class ${name}Service {\n`;
        service += `${indent}private baseURL = process.env.API_URL || ${quote}http://localhost:3000${quote}${semi}\n\n`;
        
        if (hasAxios) {
          service += `${indent}private client = axios.create({\n`;
          service += `${indent}${indent}baseURL: this.baseURL\n`;
          service += `${indent}})${semi}\n\n`;
        }
        
        service += `${indent}async get${name}s(): Promise<${name}[]> {\n`;
        if (hasAxios) {
          service += `${indent}${indent}const response = await this.client.get(${quote}/${name.toLowerCase()}s${quote})${semi}\n`;
          service += `${indent}${indent}return response.data${semi}\n`;
        } else {
          service += `${indent}${indent}const response = await fetch(\`\${this.baseURL}/${name.toLowerCase()}s\`)${semi}\n`;
          service += `${indent}${indent}return response.json()${semi}\n`;
        }
        service += `${indent}}\n`;
        service += `}`;
        
        return imports + service;
      },

      getFilePath: (request, context) => {
        const { name } = request;
        const { structure } = context;
        const ext = context.stack.hasTypeScript ? '.ts' : '.js';
        return `${structure.sourceDir}/services/${name}Service${ext}`;
      }
    });
  }

  /**
   * Generate component test following project patterns
   */
  private generateComponentTest(componentName: string, context: ProjectContext): string {
    const { style, stack, testing } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    const indent = style.indentation === 'tabs' ? '\t' : ' '.repeat(style.indentSize);
    
    let testContent = '';
    
    // Imports
    if (stack.framework === 'React') {
      testContent += `import { render, screen } from ${quote}@testing-library/react${quote}${semi}\n`;
      testContent += `import { ${componentName} } from ${quote}./${componentName}${quote}${semi}\n\n`;
    }
    
    // Test suite
    if (testing.setupPatterns.includes('describe blocks')) {
      testContent += `describe(${quote}${componentName}${quote}, () => {\n`;
      testContent += `${indent}it(${quote}renders without crashing${quote}, () => {\n`;
      testContent += `${indent}${indent}render(<${componentName} />)${semi}\n`;
      testContent += `${indent}})${semi}\n`;
      testContent += `})${semi}`;
    } else {
      testContent += `test(${quote}${componentName} renders without crashing${quote}, () => {\n`;
      testContent += `${indent}render(<${componentName} />)${semi}\n`;
      testContent += `})${semi}`;
    }
    
    return testContent;
  }

  /**
   * Format code according to project style guide
   */
  formatCode(code: string, context: ProjectContext): string {
    let formatted = code;
    
    // Apply indentation
    if (context.style.indentation === 'tabs') {
      formatted = formatted.replace(/^  /gm, '\t');
    } else {
      const spaces = ' '.repeat(context.style.indentSize);
      formatted = formatted.replace(/^\t/gm, spaces);
    }
    
    // Apply quote style
    if (context.style.quoteStyle === 'single') {
      formatted = formatted.replace(/"/g, "'");
    } else {
      formatted = formatted.replace(/'/g, '"');
    }
    
    // Apply semicolon style
    if (!context.style.useSemicolons) {
      formatted = formatted.replace(/;$/gm, '');
    }
    
    return formatted;
  }
}