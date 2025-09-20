/**
 * Model Selector Component
 * 
 * Allows users to select and switch between available Ollama models
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

export interface OllamaModel {
  name: string;
  size: string;
  modified: string;
  digest: string;
}

interface ModelSelectorProps {
  currentModel: string;
  onModelSelect: (model: string) => void;
  onClose: () => void;
}

export function ModelSelector({ currentModel, onModelSelect, onClose }: ModelSelectorProps) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch models from Ollama API
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        throw new Error('Failed to connect to Ollama. Is Ollama running?');
      }
      
      const data = await response.json();
      const modelList = data.models || [];
      setModels(modelList);
      
      // Set selected index to current model
      const currentIndex = modelList.findIndex((m: OllamaModel) => m.name === currentModel);
      if (currentIndex !== -1) {
        setSelectedIndex(currentIndex);
      }
      
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
      setLoading(false);
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (loading) return;

    if (key.upArrow) {
      setSelectedIndex(prev => (prev - 1 + models.length) % models.length);
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => (prev + 1) % models.length);
      return;
    }

    if (key.return) {
      if (models[selectedIndex]) {
        onModelSelect(models[selectedIndex].name);
        onClose();
      }
      return;
    }

    if (input === 'r') {
      loadModels();
      return;
    }
  });

  if (loading) {
    return (
      <Box 
        borderStyle="single"
        borderColor="blue"
        padding={1}
        marginY={1}
      >
        <Box flexDirection="column">
          <Text color="blue" bold>🦙 Model Selection</Text>
          <Text color="yellow">Loading available models...</Text>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box 
        borderStyle="single"
        borderColor="red"
        padding={1}
        marginY={1}
      >
        <Box flexDirection="column">
          <Text color="red" bold>❌ Error Loading Models</Text>
          <Text color="white">{error}</Text>
          <Box marginTop={1}>
            <Text color="gray">Press 'r' to retry, ESC to cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (models.length === 0) {
    return (
      <Box 
        borderStyle="single"
        borderColor="yellow"
        padding={1}
        marginY={1}
      >
        <Box flexDirection="column">
          <Text color="yellow" bold>⚠️ No Models Found</Text>
          <Text color="white">No Ollama models are installed.</Text>
          <Text color="gray">Install models with: ollama pull &lt;model-name&gt;</Text>
          <Box marginTop={1}>
            <Text color="gray">Press 'r' to refresh, ESC to cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box 
      borderStyle="single"
      borderColor="blue"
      padding={1}
      marginY={1}
    >
      <Box flexDirection="column">
        <Text color="blue" bold>🦙 Select Model</Text>
        <Text color="gray">Use ↑↓ to navigate, Enter to select, ESC to cancel</Text>
        
        <Box flexDirection="column" marginTop={1}>
          {models.map((model, index) => {
            const isSelected = index === selectedIndex;
            const isCurrent = model.name === currentModel;
            
            return (
              <Box key={model.name} marginBottom={0}>
                <Text 
                  color={isSelected ? 'black' : isCurrent ? 'green' : 'white'}
                  backgroundColor={isSelected ? 'blue' : undefined}
                >
                  {isSelected ? '▶ ' : '  '}
                  {model.name}
                  {isCurrent ? ' (current)' : ''}
                </Text>
                {isSelected && (
                  <Box marginLeft={4}>
                    <Text color="gray">
                      Size: {formatSize(model.size)} | Modified: {formatDate(model.modified)}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
        
        <Box marginTop={1}>
          <Text color="gray">💡 Press 'r' to refresh model list</Text>
        </Box>
      </Box>
    </Box>
  );
}

function formatSize(sizeStr: string): string {
  try {
    const size = parseInt(sizeStr);
    if (size > 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    } else if (size > 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)}MB`;
    } else {
      return `${size}B`;
    }
  } catch {
    return sizeStr;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}