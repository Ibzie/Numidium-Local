/**
 * Slash Menu Component
 * 
 * Shows available slash commands with arrow key navigation
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface SlashMenuProps {
  onClose: () => void;
  onSelectCommand: (command: string) => void;
}

export function SlashMenu({ onClose, onSelectCommand }: SlashMenuProps) {
  const commands = [
    { key: 'h', label: 'Show help', description: 'Display help information' },
    { key: 'm', label: 'Switch models', description: 'Change the active AI model' },
    { key: 's', label: 'Settings', description: 'Configure Numidium-Local settings' },
    { key: 'c', label: 'Clear session', description: 'Clear conversation history' },
    { key: 'q', label: 'Quit', description: 'Exit Numidium-Local' }
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => (prev - 1 + commands.length) % commands.length);
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => (prev + 1) % commands.length);
      return;
    }

    if (key.return) {
      onSelectCommand(commands[selectedIndex].key);
      onClose();
      return;
    }

    // Legacy key support
    const command = commands.find(cmd => cmd.key === input);
    if (command) {
      onSelectCommand(command.key);
      onClose();
      return;
    }
  });
  return (
    <Box 
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      marginTop={1}
    >
      <Box flexDirection="column">
        <Text color="cyan" bold>🚀 Numidium-Local Commands</Text>
        <Text color="gray">Use ↑↓ to navigate, Enter to select, ESC to cancel</Text>
        
        <Box flexDirection="column" marginTop={1}>
          {commands.map((command, index) => (
            <Box key={command.key} marginTop={1}>
              <Text color={index === selectedIndex ? 'black' : 'cyan'}
                    backgroundColor={index === selectedIndex ? 'cyan' : undefined}>
                {index === selectedIndex ? '▶ ' : '  '}
                {command.key} - {command.label}
              </Text>
              {index === selectedIndex && (
                <Box marginLeft={4}>
                  <Text color="gray">
                    {command.description}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
        
        <Box marginTop={1}>
          <Text color="gray">💡 Also works with direct key presses (h, m, s, c, q)</Text>
        </Box>
      </Box>
    </Box>
  );
}