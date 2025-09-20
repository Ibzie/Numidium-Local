/**
 * AI-CLI Persistent Session Manager
 * 
 * Manages conversation history, context compaction, and session state
 * Similar to Claude Code's session management
 */

import { Content } from '../types.js';
import { OllamaModelManager, LocalModel } from '../ollama/models.js';
import { createOllamaContentGenerator } from '../ollama/contentGenerator.js';

export interface SessionConfig {
  ollamaHost: string;
  defaultModel: string;
  maxContextTokens: number;
  contextCompactionThreshold: number; // When to compact (e.g., 0.8 = 80% of max)
  persistSettings: boolean;
}

export interface SessionSettings {
  alwaysAllowFileOps?: boolean;
  alwaysAllowShellCommands?: boolean;
  autoApproveLevel?: 'none' | 'read-only' | 'safe' | 'all';
  preferredModel?: string;
}

export interface SessionState {
  id: string;
  startTime: Date;
  lastActivity: Date;
  conversationHistory: Content[];
  currentModel: string;
  settings: SessionSettings;
  tokenCount: number;
  compactionCount: number;
}

export class AiCliSession {
  protected config: SessionConfig;
  private state: SessionState;
  private modelManager: OllamaModelManager;
  private contentGenerator: any;

  constructor(config: SessionConfig) {
    this.config = config;
    this.modelManager = new OllamaModelManager();
    
    this.state = {
      id: this.generateSessionId(),
      startTime: new Date(),
      lastActivity: new Date(),
      conversationHistory: [],
      currentModel: config.defaultModel,
      settings: {},
      tokenCount: 0,
      compactionCount: 0
    };

    this.initializeContentGenerator();
  }

  /**
   * Add a message to the conversation history
   */
  async addMessage(content: Content): Promise<void> {
    this.state.conversationHistory.push(content);
    this.state.lastActivity = new Date();
    
    // Estimate token count
    this.state.tokenCount = await this.estimateTokenCount();
    
    // Check if we need to compact
    if (this.shouldCompactContext()) {
      await this.compactContext();
    }
  }

  /**
   * Get the current conversation history
   */
  getHistory(): Content[] {
    return [...this.state.conversationHistory];
  }

  /**
   * Switch to a different model
   */
  async switchModel(modelName: string): Promise<boolean> {
    const model = await this.modelManager.getModel(modelName);
    if (!model) {
      return false;
    }

    this.state.currentModel = modelName;
    this.config.maxContextTokens = model.capabilities.maxContextLength;
    this.initializeContentGenerator();
    
    // Add system message about model switch
    await this.addMessage({
      role: 'model',
      parts: [{ text: `[Switched to model: ${model.displayName}]` }]
    });

    return true;
  }

  /**
   * Update session settings
   */
  updateSettings(newSettings: Partial<SessionSettings>): void {
    this.state.settings = { ...this.state.settings, ...newSettings };
  }

  /**
   * Get current session state
   */
  getState(): SessionState {
    return { ...this.state };
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.state.conversationHistory = [];
    this.state.tokenCount = 0;
    this.state.compactionCount = 0;
  }

  /**
   * Generate response using current model
   */
  async generateResponse(userInput: string): Promise<string> {
    // Add user message
    await this.addMessage({
      role: 'user',
      parts: [{ text: userInput }]
    });

    try {
      const response = await this.contentGenerator.generateContent({
        contents: this.state.conversationHistory
      }, `session-${this.state.id}-${Date.now()}`);

      if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        const aiResponse = response.candidates[0].content.parts[0].text;
        
        // Add AI response to history
        await this.addMessage({
          role: 'model',
          parts: [{ text: aiResponse }]
        });

        return aiResponse;
      }

      return "I couldn't generate a response. Please try again.";

    } catch (error) {
      const errorMessage = `Error generating response: ${error instanceof Error ? error.message : String(error)}`;
      
      // Add error to history for context
      await this.addMessage({
        role: 'model',
        parts: [{ text: `[Error: ${errorMessage}]` }]
      });

      return errorMessage;
    }
  }

  /**
   * Check if context should be compacted
   */
  private shouldCompactContext(): boolean {
    const threshold = this.config.maxContextTokens * this.config.contextCompactionThreshold;
    return this.state.tokenCount > threshold;
  }

  /**
   * Compact conversation context when approaching token limit
   */
  private async compactContext(): Promise<void> {
    if (this.state.conversationHistory.length <= 2) {
      return; // Keep at least the system prompt and one exchange
    }

    // Create a summary of older messages
    const messagesToSummarize = this.state.conversationHistory.slice(0, -4); // Keep last 4 messages
    const recentMessages = this.state.conversationHistory.slice(-4);

    if (messagesToSummarize.length > 0) {
      try {
        // Generate summary
        const summaryPrompt = this.createSummaryPrompt(messagesToSummarize);
        const summaryResponse = await this.contentGenerator.generateContent({
          contents: [{
            role: 'user',
            parts: [{ text: summaryPrompt }]
          }]
        }, `summary-${this.state.id}-${Date.now()}`);

        if (summaryResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
          const summary = summaryResponse.candidates[0].content.parts[0].text;
          
          // Replace old messages with summary
          this.state.conversationHistory = [
            {
              role: 'model',
              parts: [{ text: `[Previous conversation summary: ${summary}]` }]
            },
            ...recentMessages
          ];

          this.state.compactionCount++;
          this.state.tokenCount = await this.estimateTokenCount();
        }
      } catch (error) {
        // If summarization fails, just truncate
        this.state.conversationHistory = recentMessages;
        this.state.tokenCount = await this.estimateTokenCount();
      }
    }
  }

  /**
   * Create a prompt for summarizing conversation history
   */
  private createSummaryPrompt(messages: Content[]): string {
    const conversationText = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts.map(p => p.text).join(' ')}`)
      .join('\n');

    return `Please create a concise summary of this conversation history, focusing on key topics, decisions, and context that would be important for continuing the conversation:

${conversationText}

Summary:`;
  }

  /**
   * Estimate token count for current conversation
   */
  private async estimateTokenCount(): Promise<number> {
    if (!this.contentGenerator) return 0;
    
    try {
      const response = await this.contentGenerator.countTokens({
        contents: this.state.conversationHistory
      });
      return response.totalTokens;
    } catch (error) {
      // Fallback estimation: ~3.5 chars per token
      const totalChars = this.state.conversationHistory
        .flatMap(msg => msg.parts)
        .map(part => part.text || '')
        .join('').length;
      
      return Math.ceil(totalChars / 3.5);
    }
  }

  /**
   * Initialize content generator with current model
   */
  private initializeContentGenerator(): void {
    this.contentGenerator = createOllamaContentGenerator({
      model: this.state.currentModel,
      ollamaHost: this.config.ollamaHost
    });
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `ai-cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}