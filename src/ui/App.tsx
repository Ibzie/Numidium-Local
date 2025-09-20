/**
 * Main React app for the terminal UI
 *
 * This is where all the magic happens - handles state, renders the chat,
 * and somehow makes Ink work without losing my sanity
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { AiCliSession, SessionConfig } from '../session/session.js';
import { StructuredSession, StructuredSessionConfig } from '../session/structuredSession.js';
import { TaskTracker, Task } from '../tools/taskTracker.js';
import { ChatView } from './components/ChatView.js';
import { InputPrompt } from './components/InputPrompt.js';
import { StatusBar } from './components/StatusBar.js';
import { SlashMenu } from './components/SlashMenu.js';
import { PermissionDialog } from './components/PermissionDialog.js';
import { TaskTracker as TaskTrackerComponent } from './components/TaskTracker.js';
import { ModelSelector } from './components/ModelSelector.js';

export interface AppState {
  isLoading: boolean;
  currentModel: string;
  sessionId: string;
  showSlashMenu: boolean;
  showPermissionDialog: boolean;
  showTaskTracker: boolean;
  showModelSelector: boolean;
  permissionRequest?: any;
  currentTasks: Task[];
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    toolExecutions?: any[];
  }>;
}

export default function App() {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({
    isLoading: false,
    currentModel: '', // Will be set from session
    sessionId: '',
    showSlashMenu: false,
    showPermissionDialog: false,
    showTaskTracker: false,
    showModelSelector: false,
    currentTasks: [],
    messages: []
  });
  
  const [session, setSession] = useState<StructuredSession | null>(null);
  const [taskTracker, setTaskTracker] = useState<TaskTracker | null>(null);
  const [input, setInput] = useState('');

  // Set up the AI session when component loads
  useEffect(() => {
    const config: StructuredSessionConfig = {
      ollamaHost: 'http://localhost:11434',
      defaultModel: 'qwen3:latest',
      maxContextTokens: 8192,
      contextCompactionThreshold: 0.8,
      persistSettings: true,
      apiConfig: {
        temperature: 0.1,
        timeout: 120000,
        retries: 3
      },
      toolConfig: {
        requireConfirmation: true,
        autoExecuteTools: true
      }
    };

    const initializeSession = async () => {
      const newSession = await StructuredSession.create(config, process.cwd(), handlePermissionRequest);
      setSession(newSession);
    
      const newTaskTracker = new TaskTracker(newSession.getState().id);
      setTaskTracker(newTaskTracker);
      
      setState(prev => ({
        ...prev,
        sessionId: newSession.getState().id,
        currentModel: newSession.getState().currentModel, // Set the correct current model
        messages: [{
          role: 'system',
          content: '🚀 Numidium-Local - Your Local AI Development Agent is ready. Type your message or use "/" for commands.',
          timestamp: new Date()
        }]
      }));
    };

    initializeSession().catch(error => {
      console.error('Failed to initialize session:', error);
      setState(prev => ({
        ...prev,
        messages: [{
          role: 'system',
          content: `❌ Failed to initialize: ${error.message}`,
          timestamp: new Date()
        }]
      }));
    });
  }, []);

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (state.showSlashMenu) {
      // Slash menu handles its own input
      return;
    }
    
    if (state.showPermissionDialog) {
      // Permission dialog handles its own input
      return;
    }


    if (state.showTaskTracker) {
      // Task tracker handles its own input
      return;
    }

    if (state.showModelSelector) {
      // Model selector handles its own input
      return;
    }

    if (key.escape) {
      exit();
      return;
    }

    // Handle slash command trigger
    if (input === '/' && !state.isLoading) {
      setState(prev => ({ ...prev, showSlashMenu: true }));
      setInput(''); // Clear the input
      return;
    }

    // Handle task tracker toggle
    if (input === 't' && !state.isLoading && state.currentTasks.length > 0) {
      setState(prev => ({ ...prev, showTaskTracker: !prev.showTaskTracker }));
      return;
    }
  });

  const handleSlashCommand = (command: string) => {
    // Close slash menu and clear input
    setState(prev => ({ ...prev, showSlashMenu: false }));
    setInput('');

    switch (command) {
      case 'h':
        showHelp();
        break;
      case 'm':
        showModelMenu();
        break;
      case 's':
        showSettings();
        break;
      case 'c':
        clearSession();
        break;
      case 'q':
        exit();
        break;
    }
  };


  const handleMessageSubmit = useCallback(async (message: string) => {
    if (!session || state.isLoading) return;

    // Add user message to display
    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date()
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true
    }));

    try {
      // Check if we need task tracking
      if (taskTracker && taskTracker.shouldUseTaskTracking(message)) {
        const suggestedTasks = taskTracker.suggestTasksFromRequest(message);
        const tasks = taskTracker.updateTasks(suggestedTasks);
        
        setState(prev => ({
          ...prev,
          currentTasks: tasks,
          showTaskTracker: true
        }));
      }

      // Generate AI response with intelligent tool calling
      const result = await session.generateResponseWithIntelligentTools(message);
      
      // Add execution info if tools were used
      let content = result.response;
      if (result.toolExecutions.length > 0) {
        const executedTools = result.toolExecutions.map(te => te.toolName).join(', ');
        content += `\n\n_Executed tools: ${executedTools}_`;
      }
      
      // Add AI response to display
      const aiMessage = {
        role: 'assistant' as const,
        content,
        timestamp: new Date(),
        toolExecutions: result.toolExecutions
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, aiMessage],
        isLoading: false
      }));

    } catch (error) {
      const errorMessage = {
        role: 'system' as const,
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date()
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        isLoading: false
      }));
    }
  }, [session, state.isLoading]);

  const handlePermissionRequest = useCallback((request: import('../tools/toolRegistry.js').ToolCallConfirmationDetails): Promise<boolean> => {
    return new Promise((resolve) => {
      setState(prev => ({
        ...prev,
        showPermissionDialog: true,
        permissionRequest: { ...request, resolve }
      }));
    });
  }, []);


  const showHelp = () => {
    const helpMessage = {
      role: 'system' as const,
      content: `Numidium-Local Help:
/h - Show this help
/m - Switch models  
/s - Settings
/c - Clear session
/q - Quit

Type naturally to chat with AI. Use Ctrl+C or ESC to exit.`,
      timestamp: new Date()
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, helpMessage],
      showSlashMenu: false
    }));
  };

  const showModelMenu = () => {
    setState(prev => ({
      ...prev,
      showModelSelector: true,
      showSlashMenu: false
    }));
  };

  const handleModelSelect = async (modelName: string) => {
    if (!session) return;

    setState(prev => ({
      ...prev,
      currentModel: modelName,
      isLoading: true
    }));

    try {
      // Switch the session to use the new model - fail fast on error
      await session.switchModel(modelName);
      
      const statusMessage = {
        role: 'system' as const,
        content: `✅ Switched to model: ${modelName}`,
        timestamp: new Date()
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, statusMessage],
        currentModel: modelName,
        isLoading: false
      }));

    } catch (error) {
      // Fail fast - throw error instead of fallback
      throw error;
    }
  };

  const showSettings = () => {
    const settingsMessage = {
      role: 'system' as const,
      content: `Settings menu coming soon...`,
      timestamp: new Date()
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, settingsMessage],
      showSlashMenu: false
    }));
  };

  const clearSession = () => {
    if (session) {
      session.clearHistory();
    }
    
    setState(prev => ({
      ...prev,
      messages: [{
        role: 'system',
        content: 'Session cleared. Starting fresh conversation.',
        timestamp: new Date()
      }],
      showSlashMenu: false
    }));
  };

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar 
        model={state.currentModel}
        sessionId={state.sessionId}
        isLoading={state.isLoading}
      />
      
      <Box flexGrow={1}>
        <ChatView messages={state.messages} isLoading={state.isLoading} />
      </Box>

      {state.showSlashMenu && (
        <SlashMenu
          onClose={() => {
            setState(prev => ({ ...prev, showSlashMenu: false }));
            setInput('');
          }}
          onSelectCommand={handleSlashCommand}
        />
      )}

      {state.showPermissionDialog && state.permissionRequest && (
        <PermissionDialog 
          request={state.permissionRequest}
          onClose={() => setState(prev => ({ 
            ...prev, 
            showPermissionDialog: false, 
            permissionRequest: undefined 
          }))}
        />
      )}


      {state.showTaskTracker && (
        <TaskTrackerComponent
          tasks={state.currentTasks}
          onClose={() => setState(prev => ({ ...prev, showTaskTracker: false }))}
        />
      )}

      {state.showModelSelector && (
        <ModelSelector
          currentModel={state.currentModel}
          onModelSelect={handleModelSelect}
          onClose={() => setState(prev => ({ ...prev, showModelSelector: false }))}
        />
      )}

      <InputPrompt 
        onSubmit={handleMessageSubmit}
        disabled={state.isLoading || state.showSlashMenu || state.showPermissionDialog || state.showTaskTracker || state.showModelSelector}
        value={input}
        onChange={setInput}
        placeholder={
          state.showSlashMenu ? "Select command..." :
          state.showTaskTracker ? "Viewing tasks..." :
          state.showModelSelector ? "Select model..." :
          state.currentTasks.length > 0 ? "Type your message... (Press 't' for tasks)" :
          "Type your message..."
        }
      />
    </Box>
  );
}