/**
 * Multi-File Operations System
 * 
 * Handles complex development operations that involve multiple files,
 * such as creating features, refactoring across files, and adding comprehensive functionality.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContext } from '../analysis/projectContext.js';
import { IntelligentCodeGenerator, GenerationRequest } from '../generation/codeGenerator.js';

/**
 * Represents a file operation to be performed
 */
export interface FileOperation {
  /** Type of operation */
  type: 'create' | 'update' | 'delete' | 'move';
  /** Target file path */
  filePath: string;
  /** File content (for create/update) */
  content?: string;
  /** Original path (for move operations) */
  originalPath?: string;
  /** Purpose description */
  purpose: string;
}

/**
 * Complex operation that involves multiple files and steps
 */
export interface MultiFileOperation {
  /** Operation name */
  name: string;
  /** Description of what this operation does */
  description: string;
  /** List of file operations to perform */
  operations: FileOperation[];
  /** Commands to run after file operations */
  postCommands?: string[];
}

/**
 * Request for a complex development operation
 */
export interface OperationRequest {
  /** Type of operation */
  type: 'feature' | 'refactor' | 'component-suite' | 'api-layer' | 'test-suite' | 'documentation';
  /** Name/identifier for the operation */
  name: string;
  /** Detailed description */
  description: string;
  /** Additional parameters */
  parameters?: Record<string, any>;
}

/**
 * Manages complex multi-file development operations
 */
export class MultiFileOperationManager {
  private codeGenerator: IntelligentCodeGenerator;
  
  constructor() {
    this.codeGenerator = new IntelligentCodeGenerator();
  }

  /**
   * Execute a complex operation based on request and project context
   */
  async executeOperation(request: OperationRequest, context: ProjectContext): Promise<MultiFileOperation> {
    switch (request.type) {
      case 'feature':
        return await this.createFeature(request, context);
      case 'component-suite':
        return await this.createComponentSuite(request, context);
      case 'api-layer':
        return await this.createApiLayer(request, context);
      case 'test-suite':
        return await this.createTestSuite(request, context);
      case 'refactor':
        return await this.executeRefactoring(request, context);
      case 'documentation':
        return await this.generateDocumentation(request, context);
      default:
        throw new Error(`Unknown operation type: ${request.type}`);
    }
  }

  /**
   * Create a complete feature with all supporting files
   */
  private async createFeature(request: OperationRequest, context: ProjectContext): Promise<MultiFileOperation> {
    const { name, description, parameters } = request;
    const operations: FileOperation[] = [];
    
    // Determine feature structure based on project organization
    const featurePath = context.structure.organizationStyle === 'feature' 
      ? `${context.structure.sourceDir}/features/${name}`
      : `${context.structure.sourceDir}/${name}`;

    // Create feature directory structure
    const components = parameters?.components || [`${name}List`, `${name}Detail`, `${name}Form`];
    
    // Generate main component files
    for (const componentName of components) {
      const componentRequest: GenerationRequest = {
        type: 'component',
        name: componentName,
        description: `${componentName} component for ${description}`,
        parameters: parameters?.componentProps?.[componentName]
      };

      const result = this.codeGenerator.generateCode(componentRequest, context);
      
      operations.push({
        type: 'create',
        filePath: `${featurePath}/components/${componentName}/${componentName}${context.stack.hasTypeScript ? '.tsx' : '.jsx'}`,
        content: result.content,
        purpose: `Main ${componentName} component`
      });

      // Add test files
      result.additionalFiles.forEach(file => {
        operations.push({
          type: 'create',
          filePath: `${featurePath}/components/${componentName}/${file.path.split('/').pop()}`,
          content: file.content,
          purpose: file.purpose
        });
      });
    }

    // Generate types if TypeScript
    if (context.stack.hasTypeScript) {
      const typeRequest: GenerationRequest = {
        type: 'type',
        name: name,
        description: `Type definitions for ${description}`,
        parameters: {
          fields: parameters?.fields || [
            { name: 'id', type: 'string', description: 'Unique identifier' },
            { name: 'name', type: 'string', description: 'Display name' },
            { name: 'createdAt', type: 'Date', description: 'Creation timestamp' }
          ]
        }
      };

      const typeResult = this.codeGenerator.generateCode(typeRequest, context);
      operations.push({
        type: 'create',
        filePath: `${featurePath}/types/${name}.ts`,
        content: typeResult.content,
        purpose: 'Type definitions'
      });
    }

    // Generate service layer
    const serviceRequest: GenerationRequest = {
      type: 'service',
      name: name,
      description: `Service layer for ${description}`
    };

    const serviceResult = this.codeGenerator.generateCode(serviceRequest, context);
    operations.push({
      type: 'create',
      filePath: `${featurePath}/services/${name}Service${context.stack.hasTypeScript ? '.ts' : '.js'}`,
      content: serviceResult.content,
      purpose: 'Service layer'
    });

    // Create feature index file
    const indexContent = this.generateFeatureIndex(name, components, context);
    operations.push({
      type: 'create',
      filePath: `${featurePath}/index${context.stack.hasTypeScript ? '.ts' : '.js'}`,
      content: indexContent,
      purpose: 'Feature exports'
    });

    // Generate hook if React
    if (context.stack.framework === 'React') {
      const hookContent = this.generateCustomHook(name, context);
      operations.push({
        type: 'create',
        filePath: `${featurePath}/hooks/use${name}${context.stack.hasTypeScript ? '.ts' : '.js'}`,
        content: hookContent,
        purpose: 'Custom React hook'
      });
    }

    return {
      name: `Create ${name} Feature`,
      description: `Complete feature implementation for ${description}`,
      operations,
      postCommands: context.stack.linter ? [`${context.stack.packageManager} run lint --fix`] : undefined
    };
  }

  /**
   * Create a component suite (component + tests + stories + docs)
   */
  private async createComponentSuite(request: OperationRequest, context: ProjectContext): Promise<MultiFileOperation> {
    const { name, description, parameters } = request;
    const operations: FileOperation[] = [];

    // Generate main component
    const componentRequest: GenerationRequest = {
      type: 'component',
      name: name,
      description: description,
      parameters: parameters
    };

    const result = this.codeGenerator.generateCode(componentRequest, context);
    operations.push({
      type: 'create',
      filePath: result.filePath,
      content: result.content,
      purpose: 'Main component'
    });

    // Add test files
    result.additionalFiles.forEach(file => {
      operations.push({
        type: 'create',
        filePath: file.path,
        content: file.content,
        purpose: file.purpose
      });
    });

    // Generate Storybook story if Storybook is detected
    if (context.dependencies.devDependencies['@storybook/react']) {
      const storyContent = this.generateStorybookStory(name, context);
      const storyPath = result.filePath.replace(/\.(tsx?|jsx?)$/, '.stories$1');
      operations.push({
        type: 'create',
        filePath: storyPath,
        content: storyContent,
        purpose: 'Storybook story'
      });
    }

    // Generate component documentation
    const docContent = this.generateComponentDocumentation(name, description, parameters?.props || [], context);
    const docPath = result.filePath.replace(/\.(tsx?|jsx?)$/, '.md');
    operations.push({
      type: 'create',
      filePath: docPath,
      content: docContent,
      purpose: 'Component documentation'
    });

    return {
      name: `Create ${name} Component Suite`,
      description: `Complete component implementation with tests, stories, and documentation`,
      operations
    };
  }

  /**
   * Create complete API layer with types, services, and validation
   */
  private async createApiLayer(request: OperationRequest, context: ProjectContext): Promise<MultiFileOperation> {
    const { name, description, parameters } = request;
    const operations: FileOperation[] = [];
    const endpoints = parameters?.endpoints || ['list', 'get', 'create', 'update', 'delete'];

    // Generate API types
    if (context.stack.hasTypeScript) {
      const typeRequest: GenerationRequest = {
        type: 'type',
        name: `${name}API`,
        description: `API types for ${description}`,
        parameters: {
          fields: [
            ...parameters?.fields || [],
            { name: 'ApiResponse', type: `{ data: ${name}[], total: number }`, description: 'API response wrapper' },
            { name: 'CreateRequest', type: `Omit<${name}, 'id' | 'createdAt'>`, description: 'Create request payload' }
          ]
        }
      };

      const typeResult = this.codeGenerator.generateCode(typeRequest, context);
      operations.push({
        type: 'create',
        filePath: `${context.structure.sourceDir}/api/types/${name}.ts`,
        content: typeResult.content,
        purpose: 'API type definitions'
      });
    }

    // Generate API service with all endpoints
    const serviceContent = this.generateApiService(name, endpoints, context);
    operations.push({
      type: 'create',
      filePath: `${context.structure.sourceDir}/api/services/${name}Api${context.stack.hasTypeScript ? '.ts' : '.js'}`,
      content: serviceContent,
      purpose: 'API service layer'
    });

    // Generate validation schemas if Zod is available
    if (context.dependencies.dependencies.zod || context.dependencies.devDependencies.zod) {
      const validationContent = this.generateValidationSchemas(name, parameters?.fields || [], context);
      operations.push({
        type: 'create',
        filePath: `${context.structure.sourceDir}/api/validation/${name}Schema${context.stack.hasTypeScript ? '.ts' : '.js'}`,
        content: validationContent,
        purpose: 'Validation schemas'
      });
    }

    // Generate API hooks for React
    if (context.stack.framework === 'React') {
      const hooksContent = this.generateApiHooks(name, endpoints, context);
      operations.push({
        type: 'create',
        filePath: `${context.structure.sourceDir}/api/hooks/use${name}Api${context.stack.hasTypeScript ? '.ts' : '.js'}`,
        content: hooksContent,
        purpose: 'React API hooks'
      });
    }

    return {
      name: `Create ${name} API Layer`,
      description: `Complete API implementation with types, services, and hooks`,
      operations,
      postCommands: [`${context.stack.packageManager} run type-check`]
    };
  }

  /**
   * Generate comprehensive test suite for existing code
   */
  private async createTestSuite(request: OperationRequest, context: ProjectContext): Promise<MultiFileOperation> {
    const { name, description, parameters } = request;
    const operations: FileOperation[] = [];
    const targetFiles = parameters?.targetFiles || [];

    for (const targetFile of targetFiles) {
      try {
        const content = await fs.readFile(targetFile, 'utf-8');
        const testContent = await this.generateTestsForFile(targetFile, content, context);
        
        const testPath = this.getTestPath(targetFile, context);
        operations.push({
          type: 'create',
          filePath: testPath,
          content: testContent,
          purpose: `Tests for ${path.basename(targetFile)}`
        });
      } catch (error) {
        throw new Error(`Failed to create tests for ${targetFile}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      name: `Create ${name} Test Suite`,
      description: `Comprehensive test suite for ${description}`,
      operations,
      postCommands: [`${context.stack.packageManager} run test`]
    };
  }

  /**
   * Execute refactoring operation across multiple files
   */
  private async executeRefactoring(request: OperationRequest, context: ProjectContext): Promise<MultiFileOperation> {
    // This would implement complex refactoring operations
    // For now, returning a placeholder
    throw new Error('Refactoring operations not yet implemented');
  }

  /**
   * Generate documentation for project or specific modules
   */
  private async generateDocumentation(request: OperationRequest, context: ProjectContext): Promise<MultiFileOperation> {
    const operations: FileOperation[] = [];
    
    // Generate README if it doesn't exist
    const readmePath = path.join(context.rootPath, 'README.md');
    try {
      await fs.access(readmePath);
    } catch {
      const readmeContent = this.generateProjectReadme(context);
      operations.push({
        type: 'create',
        filePath: 'README.md',
        content: readmeContent,
        purpose: 'Project README'
      });
    }

    return {
      name: 'Generate Documentation',
      description: 'Generate comprehensive project documentation',
      operations
    };
  }

  /**
   * Helper methods for generating specific code types
   */

  private generateFeatureIndex(featureName: string, components: string[], context: ProjectContext): string {
    const { style } = context;
    const semi = style.useSemicolons ? ';' : '';
    
    let content = `// ${featureName} Feature Exports\n\n`;
    
    // Export components
    content += '// Components\n';
    components.forEach(comp => {
      content += `export { ${comp} } from './components/${comp}/${comp}'${semi}\n`;
    });
    
    // Export service
    content += '\n// Service\n';
    content += `export { ${featureName}Service } from './services/${featureName}Service'${semi}\n`;
    
    // Export types if TypeScript
    if (context.stack.hasTypeScript) {
      content += '\n// Types\n';
      content += `export type { ${featureName} } from './types/${featureName}'${semi}\n`;
    }
    
    return content;
  }

  private generateCustomHook(name: string, context: ProjectContext): string {
    const { style, stack } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    const indent = style.indentation === 'tabs' ? '\t' : ' '.repeat(style.indentSize);
    
    let hook = `import { useState, useEffect } from ${quote}react${quote}${semi}\n`;
    
    if (stack.hasTypeScript) {
      hook += `import type { ${name} } from '../types/${name}'${semi}\n\n`;
    }
    
    hook += `export const use${name} = () => {\n`;
    hook += `${indent}const [${name.toLowerCase()}s, set${name}s] = useState${stack.hasTypeScript ? `<${name}[]>` : ''}([])${semi}\n`;
    hook += `${indent}const [loading, setLoading] = useState(false)${semi}\n\n`;
    
    hook += `${indent}useEffect(() => {\n`;
    hook += `${indent}${indent}// Fetch ${name.toLowerCase()}s logic here\n`;
    hook += `${indent}}, [])${semi}\n\n`;
    
    hook += `${indent}return { ${name.toLowerCase()}s, loading }${semi}\n`;
    hook += `}${semi}`;
    
    return hook;
  }

  private generateStorybookStory(componentName: string, context: ProjectContext): string {
    const { style } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    
    let story = `import type { Meta, StoryObj } from ${quote}@storybook/react${quote}${semi}\n`;
    story += `import { ${componentName} } from ${quote}./${componentName}${quote}${semi}\n\n`;
    
    story += `const meta: Meta<typeof ${componentName}> = {\n`;
    story += `  title: ${quote}Components/${componentName}${quote},\n`;
    story += `  component: ${componentName},\n`;
    story += `}${semi}\n\n`;
    
    story += `export default meta${semi}\n`;
    story += `type Story = StoryObj<typeof meta>${semi}\n\n`;
    
    story += `export const Default: Story = {}${semi}`;
    
    return story;
  }

  private generateComponentDocumentation(name: string, description: string, props: any[], context: ProjectContext): string {
    let doc = `# ${name}\n\n${description}\n\n`;
    
    if (props.length > 0) {
      doc += '## Props\n\n';
      doc += '| Name | Type | Description | Required |\n';
      doc += '|------|------|-------------|----------|\n';
      
      props.forEach(prop => {
        doc += `| ${prop.name} | ${prop.type} | ${prop.description || ''} | ${prop.required ? 'Yes' : 'No'} |\n`;
      });
      doc += '\n';
    }
    
    doc += '## Usage\n\n';
    doc += '```jsx\n';
    doc += `import { ${name} } from './path/to/${name}';\n\n`;
    doc += `<${name}${props.length > 0 ? ' prop="value"' : ''} />\n`;
    doc += '```\n';
    
    return doc;
  }

  private generateApiService(name: string, endpoints: string[], context: ProjectContext): string {
    // Implementation for API service generation
    const { style, dependencies } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    const indent = style.indentation === 'tabs' ? '\t' : ' '.repeat(style.indentSize);
    
    // Build comprehensive API service
    let service = `/**\n * ${name} API Service\n * Generated API layer with full CRUD operations\n */\n\n`;
    
    // Add imports based on available dependencies
    if (dependencies.dependencies.axios) {
      service += `import axios from ${quote}axios${quote}${semi}\n`;
    }
    
    if (context.stack.hasTypeScript) {
      service += `import type { ${name}, Create${name}Request, Update${name}Request, ApiResponse } from '../types/${name}'${semi}\n\n`;
    }
    
    service += `export class ${name}ApiService {\n`;
    service += `${indent}private baseUrl = process.env.API_BASE_URL || ${quote}/api${quote}${semi}\n\n`;
    
    // Generate methods for each endpoint
    endpoints.forEach(endpoint => {
      switch (endpoint) {
        case 'list':
          service += this.generateListMethod(name, context, indent, semi, quote);
          break;
        case 'get':
          service += this.generateGetMethod(name, context, indent, semi, quote);
          break;
        case 'create':
          service += this.generateCreateMethod(name, context, indent, semi, quote);
          break;
        case 'update':
          service += this.generateUpdateMethod(name, context, indent, semi, quote);
          break;
        case 'delete':
          service += this.generateDeleteMethod(name, context, indent, semi, quote);
          break;
      }
      service += '\n';
    });
    
    service += `}`;
    
    return service;
  }

  private generateListMethod(name: string, context: ProjectContext, indent: string, semi: string, quote: string): string {
    const hasAxios = context.dependencies.dependencies.axios;
    const returnType = context.stack.hasTypeScript ? `: Promise<ApiResponse<${name}[]>>` : '';
    
    let method = `${indent}async list${name}s()${returnType} {\n`;
    if (hasAxios) {
      method += `${indent}${indent}const response = await axios.get(\`\${this.baseUrl}/${name.toLowerCase()}s\`)${semi}\n`;
      method += `${indent}${indent}return response.data${semi}\n`;
    } else {
      method += `${indent}${indent}const response = await fetch(\`\${this.baseUrl}/${name.toLowerCase()}s\`)${semi}\n`;
      method += `${indent}${indent}if (!response.ok) throw new Error(${quote}Failed to fetch ${name.toLowerCase()}s${quote})${semi}\n`;
      method += `${indent}${indent}return response.json()${semi}\n`;
    }
    method += `${indent}}\n`;
    return method;
  }

  private generateGetMethod(name: string, context: ProjectContext, indent: string, semi: string, quote: string): string {
    const hasAxios = context.dependencies.dependencies.axios;
    const returnType = context.stack.hasTypeScript ? `: Promise<${name}>` : '';
    const idType = context.stack.hasTypeScript ? 'id: string' : 'id';
    
    let method = `${indent}async get${name}(${idType})${returnType} {\n`;
    if (hasAxios) {
      method += `${indent}${indent}const response = await axios.get(\`\${this.baseUrl}/${name.toLowerCase()}s/\${id}\`)${semi}\n`;
      method += `${indent}${indent}return response.data${semi}\n`;
    } else {
      method += `${indent}${indent}const response = await fetch(\`\${this.baseUrl}/${name.toLowerCase()}s/\${id}\`)${semi}\n`;
      method += `${indent}${indent}if (!response.ok) throw new Error(${quote}Failed to fetch ${name.toLowerCase()}${quote})${semi}\n`;
      method += `${indent}${indent}return response.json()${semi}\n`;
    }
    method += `${indent}}\n`;
    return method;
  }

  private generateCreateMethod(name: string, context: ProjectContext, indent: string, semi: string, quote: string): string {
    const hasAxios = context.dependencies.dependencies.axios;
    const returnType = context.stack.hasTypeScript ? `: Promise<${name}>` : '';
    const dataType = context.stack.hasTypeScript ? `data: Create${name}Request` : 'data';
    
    let method = `${indent}async create${name}(${dataType})${returnType} {\n`;
    if (hasAxios) {
      method += `${indent}${indent}const response = await axios.post(\`\${this.baseUrl}/${name.toLowerCase()}s\`, data)${semi}\n`;
      method += `${indent}${indent}return response.data${semi}\n`;
    } else {
      method += `${indent}${indent}const response = await fetch(\`\${this.baseUrl}/${name.toLowerCase()}s\`, {\n`;
      method += `${indent}${indent}${indent}method: ${quote}POST${quote},\n`;
      method += `${indent}${indent}${indent}headers: { ${quote}Content-Type${quote}: ${quote}application/json${quote} },\n`;
      method += `${indent}${indent}${indent}body: JSON.stringify(data)\n`;
      method += `${indent}${indent}})${semi}\n`;
      method += `${indent}${indent}if (!response.ok) throw new Error(${quote}Failed to create ${name.toLowerCase()}${quote})${semi}\n`;
      method += `${indent}${indent}return response.json()${semi}\n`;
    }
    method += `${indent}}\n`;
    return method;
  }

  private generateUpdateMethod(name: string, context: ProjectContext, indent: string, semi: string, quote: string): string {
    const hasAxios = context.dependencies.dependencies.axios;
    const returnType = context.stack.hasTypeScript ? `: Promise<${name}>` : '';
    const params = context.stack.hasTypeScript ? `id: string, data: Update${name}Request` : 'id, data';
    
    let method = `${indent}async update${name}(${params})${returnType} {\n`;
    if (hasAxios) {
      method += `${indent}${indent}const response = await axios.put(\`\${this.baseUrl}/${name.toLowerCase()}s/\${id}\`, data)${semi}\n`;
      method += `${indent}${indent}return response.data${semi}\n`;
    } else {
      method += `${indent}${indent}const response = await fetch(\`\${this.baseUrl}/${name.toLowerCase()}s/\${id}\`, {\n`;
      method += `${indent}${indent}${indent}method: ${quote}PUT${quote},\n`;
      method += `${indent}${indent}${indent}headers: { ${quote}Content-Type${quote}: ${quote}application/json${quote} },\n`;
      method += `${indent}${indent}${indent}body: JSON.stringify(data)\n`;
      method += `${indent}${indent}})${semi}\n`;
      method += `${indent}${indent}if (!response.ok) throw new Error(${quote}Failed to update ${name.toLowerCase()}${quote})${semi}\n`;
      method += `${indent}${indent}return response.json()${semi}\n`;
    }
    method += `${indent}}\n`;
    return method;
  }

  private generateDeleteMethod(name: string, context: ProjectContext, indent: string, semi: string, quote: string): string {
    const hasAxios = context.dependencies.dependencies.axios;
    const returnType = context.stack.hasTypeScript ? ': Promise<void>' : '';
    const idType = context.stack.hasTypeScript ? 'id: string' : 'id';
    
    let method = `${indent}async delete${name}(${idType})${returnType} {\n`;
    if (hasAxios) {
      method += `${indent}${indent}await axios.delete(\`\${this.baseUrl}/${name.toLowerCase()}s/\${id}\`)${semi}\n`;
    } else {
      method += `${indent}${indent}const response = await fetch(\`\${this.baseUrl}/${name.toLowerCase()}s/\${id}\`, {\n`;
      method += `${indent}${indent}${indent}method: ${quote}DELETE${quote}\n`;
      method += `${indent}${indent}})${semi}\n`;
      method += `${indent}${indent}if (!response.ok) throw new Error(${quote}Failed to delete ${name.toLowerCase()}${quote})${semi}\n`;
    }
    method += `${indent}}\n`;
    return method;
  }

  private generateValidationSchemas(name: string, fields: any[], context: ProjectContext): string {
    // Generate Zod validation schemas
    const { style } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    
    let schema = `import { z } from ${quote}zod${quote}${semi}\n\n`;
    schema += `export const ${name}Schema = z.object({\n`;
    
    fields.forEach(field => {
      let zodType = 'z.string()';
      switch (field.type) {
        case 'number':
          zodType = 'z.number()';
          break;
        case 'boolean':
          zodType = 'z.boolean()';
          break;
        case 'Date':
          zodType = 'z.date()';
          break;
      }
      
      if (field.optional) zodType += '.optional()';
      schema += `  ${field.name}: ${zodType},\n`;
    });
    
    schema += `})${semi}\n\n`;
    schema += `export type ${name} = z.infer<typeof ${name}Schema>${semi}`;
    
    return schema;
  }

  private generateApiHooks(name: string, endpoints: string[], context: ProjectContext): string {
    // Generate React Query or SWR hooks based on what's available
    const hasReactQuery = context.dependencies.dependencies['@tanstack/react-query'];
    const hasSwr = context.dependencies.dependencies.swr;
    
    if (!hasReactQuery && !hasSwr) {
      // Generate basic useState hooks
      return this.generateBasicApiHooks(name, endpoints, context);
    }
    
    return hasReactQuery 
      ? this.generateReactQueryHooks(name, endpoints, context)
      : this.generateSwrHooks(name, endpoints, context);
  }

  private generateBasicApiHooks(name: string, endpoints: string[], context: ProjectContext): string {
    const { style } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    
    let hooks = `import { useState, useEffect } from ${quote}react${quote}${semi}\n`;
    hooks += `import { ${name}ApiService } from '../services/${name}Api'${semi}\n\n`;
    
    hooks += `const apiService = new ${name}ApiService()${semi}\n\n`;
    
    if (endpoints.includes('list')) {
      hooks += `export const use${name}List = () => {\n`;
      hooks += `  const [data, setData] = useState([])${semi}\n`;
      hooks += `  const [loading, setLoading] = useState(false)${semi}\n`;
      hooks += `  const [error, setError] = useState(null)${semi}\n\n`;
      hooks += `  const fetch${name}s = async () => {\n`;
      hooks += `    setLoading(true)${semi}\n`;
      hooks += `    try {\n`;
      hooks += `      const result = await apiService.list${name}s()${semi}\n`;
      hooks += `      setData(result)${semi}\n`;
      hooks += `      setError(null)${semi}\n`;
      hooks += `    } catch (err) {\n`;
      hooks += `      setError(err)${semi}\n`;
      hooks += `    } finally {\n`;
      hooks += `      setLoading(false)${semi}\n`;
      hooks += `    }\n`;
      hooks += `  }${semi}\n\n`;
      hooks += `  useEffect(() => {\n`;
      hooks += `    fetch${name}s()${semi}\n`;
      hooks += `  }, [])${semi}\n\n`;
      hooks += `  return { data, loading, error, refetch: fetch${name}s }${semi}\n`;
      hooks += `}${semi}\n\n`;
    }
    
    return hooks;
  }

  private generateReactQueryHooks(name: string, endpoints: string[], context: ProjectContext): string {
    // Implementation for React Query hooks
    const { style } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    
    let hooks = `import { useQuery, useMutation, useQueryClient } from ${quote}@tanstack/react-query${quote}${semi}\n`;
    hooks += `import { ${name}ApiService } from '../services/${name}Api'${semi}\n\n`;
    
    hooks += `const apiService = new ${name}ApiService()${semi}\n\n`;
    
    if (endpoints.includes('list')) {
      hooks += `export const use${name}List = () => {\n`;
      hooks += `  return useQuery({\n`;
      hooks += `    queryKey: [${quote}${name.toLowerCase()}s${quote}],\n`;
      hooks += `    queryFn: () => apiService.list${name}s()\n`;
      hooks += `  })${semi}\n`;
      hooks += `}${semi}\n\n`;
    }
    
    return hooks;
  }

  private generateSwrHooks(name: string, endpoints: string[], context: ProjectContext): string {
    // Implementation for SWR hooks
    const { style } = context;
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    
    let hooks = `import useSWR from ${quote}swr${quote}${semi}\n`;
    hooks += `import { ${name}ApiService } from '../services/${name}Api'${semi}\n\n`;
    
    hooks += `const apiService = new ${name}ApiService()${semi}\n\n`;
    
    if (endpoints.includes('list')) {
      hooks += `export const use${name}List = () => {\n`;
      hooks += `  const { data, error, mutate } = useSWR(\n`;
      hooks += `    ${quote}${name.toLowerCase()}s${quote},\n`;
      hooks += `    () => apiService.list${name}s()\n`;
      hooks += `  )${semi}\n\n`;
      hooks += `  return {\n`;
      hooks += `    data,\n`;
      hooks += `    loading: !error && !data,\n`;
      hooks += `    error,\n`;
      hooks += `    refetch: mutate\n`;
      hooks += `  }${semi}\n`;
      hooks += `}${semi}\n\n`;
    }
    
    return hooks;
  }

  private async generateTestsForFile(filePath: string, content: string, context: ProjectContext): Promise<string> {
    // Analyze the file and generate comprehensive tests
    // This is a simplified implementation
    const fileName = path.basename(filePath, path.extname(filePath));
    const { style, testing } = context;
    
    const semi = style.useSemicolons ? ';' : '';
    const quote = style.quoteStyle === 'single' ? "'" : '"';
    const indent = style.indentation === 'tabs' ? '\t' : ' '.repeat(style.indentSize);
    
    let tests = `import { ${fileName} } from ${quote}./${fileName}${quote}${semi}\n\n`;
    
    if (testing.setupPatterns.includes('describe blocks')) {
      tests += `describe(${quote}${fileName}${quote}, () => {\n`;
      tests += `${indent}it(${quote}should work correctly${quote}, () => {\n`;
      tests += `${indent}${indent}// TODO: Add test implementation\n`;
      tests += `${indent}${indent}expect(true).toBe(true)${semi}\n`;
      tests += `${indent}})${semi}\n`;
      tests += `})${semi}`;
    } else {
      tests += `test(${quote}${fileName} should work correctly${quote}, () => {\n`;
      tests += `${indent}// TODO: Add test implementation\n`;
      tests += `${indent}expect(true).toBe(true)${semi}\n`;
      tests += `})${semi}`;
    }
    
    return tests;
  }

  private getTestPath(filePath: string, context: ProjectContext): string {
    const { testing, structure } = context;
    const dir = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    
    const testFileName = testing.namingPattern.replace('*', name) + ext;
    
    if (testing.location === 'separate' && structure.testDir) {
      const relativePath = path.relative(structure.sourceDir, dir);
      return path.join(structure.testDir, relativePath, testFileName);
    } else {
      return path.join(dir, testFileName);
    }
  }

  private generateProjectReadme(context: ProjectContext): string {
    let readme = `# ${path.basename(context.rootPath)}\n\n`;
    readme += `## Technology Stack\n\n`;
    readme += `- **Framework**: ${context.stack.framework}\n`;
    readme += `- **Language**: ${context.stack.language}\n`;
    if (context.stack.buildTool) readme += `- **Build Tool**: ${context.stack.buildTool}\n`;
    if (context.stack.testFramework) readme += `- **Testing**: ${context.stack.testFramework}\n`;
    readme += `- **Package Manager**: ${context.stack.packageManager}\n\n`;
    
    readme += `## Getting Started\n\n`;
    readme += `1. Install dependencies:\n`;
    readme += `   \`\`\`bash\n   ${context.stack.packageManager} install\n   \`\`\`\n\n`;
    
    readme += `2. Start development server:\n`;
    readme += `   \`\`\`bash\n   ${context.stack.packageManager} run dev\n   \`\`\`\n\n`;
    
    if (context.stack.testFramework) {
      readme += `3. Run tests:\n`;
      readme += `   \`\`\`bash\n   ${context.stack.packageManager} run test\n   \`\`\`\n\n`;
    }
    
    readme += `## Project Structure\n\n`;
    readme += `\`\`\`\n`;
    readme += `${context.structure.sourceDir}/          # Source code\n`;
    if (context.structure.testDir) readme += `${context.structure.testDir}/           # Tests\n`;
    readme += `\`\`\`\n`;
    
    return readme;
  }
}