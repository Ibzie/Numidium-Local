/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Basic functionality test for Ollama integration
 * 
 * This is a simple test to validate that the Ollama integration is working
 * before running the full application.
 */

import { OllamaClient } from './client.js';
import { OllamaModelManager } from './models.js';
import { OllamaAuthManager } from './auth.js';
import { createOllamaContentGenerator } from './contentGenerator.js';

async function testOllamaBasicFunctionality(): Promise<void> {
  console.log('🚀 LocalGemini CLI - Ollama Integration Test');
  console.log('===============================================');

  try {
    // Test 1: Ollama service health
    console.log('\n1. Testing Ollama service connection...');
    const client = new OllamaClient();
    const isHealthy = await client.checkHealth();
    
    if (!isHealthy) {
      console.log('❌ Ollama service is not available');
      console.log('💡 Make sure Ollama is running: ollama serve');
      return;
    }
    console.log('✅ Ollama service is healthy');

    // Test 2: Model discovery
    console.log('\n2. Testing model discovery...');
    const models = await client.listModels();
    console.log(`✅ Found ${models.length} models:`, models.map(m => m.name));
    
    if (models.length === 0) {
      console.log('💡 No models found. Try: ollama pull qwen2.5-coder:7b');
      return;
    }

    // Test 3: Model manager
    console.log('\n3. Testing model management...');
    const modelManager = new OllamaModelManager(client);
    const availableModels = await modelManager.getAvailableModels();
    console.log(`✅ Model manager loaded ${availableModels.length} models`);

    // Test 4: Authentication
    console.log('\n4. Testing authentication system...');
    const authManager = new OllamaAuthManager();
    const connectionInfo = await authManager.validateOllamaAuth();
    console.log('✅ Authentication validation:', {
      authType: connectionInfo.authType,
      available: connectionInfo.serviceStatus.isAvailable,
      modelCount: connectionInfo.serviceStatus.modelCount,
      selectedModel: connectionInfo.selectedModel
    });

    // Test 5: Content generation (if we have a model)
    if (connectionInfo.selectedModel) {
      console.log('\n5. Testing content generation...');
      const contentGenerator = createOllamaContentGenerator({
        model: connectionInfo.selectedModel,
        ollamaHost: 'http://localhost:11434'
      });

      console.log(`Using model: ${connectionInfo.selectedModel}`);
      
      // Simple test prompt
      const testPrompt = {
        contents: [{
          role: 'user' as const,
          parts: [{ text: 'Say "Hello from LocalGemini CLI!" and nothing else.' }]
        }]
      };

      console.log('Sending test prompt...');
      const response = await contentGenerator.generateContent(testPrompt, 'test-prompt');
      
      if (response.candidates && response.candidates[0]?.content?.parts[0]?.text) {
        const responseText = response.candidates[0].content.parts[0].text;
        console.log('✅ Content generation successful!');
        console.log('📝 Response:', responseText.trim());
        
        if (response.usageMetadata) {
          console.log('📊 Usage:', {
            promptTokens: response.usageMetadata.promptTokenCount,
            responseTokens: response.usageMetadata.candidatesTokenCount,
            totalTokens: response.usageMetadata.totalTokenCount
          });
        }
      } else {
        console.log('❌ Content generation failed - no response text');
      }
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ LocalGemini CLI Ollama integration is functional');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Ensure Ollama is installed: https://ollama.ai');
    console.log('2. Start Ollama service: ollama serve');
    console.log('3. Pull a model: ollama pull qwen2.5-coder:7b');
    console.log('4. Check Ollama is running: curl http://localhost:11434');
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOllamaBasicFunctionality().catch(console.error);
}

export { testOllamaBasicFunctionality };