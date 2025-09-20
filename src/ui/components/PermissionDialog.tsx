/**
 * Permission Dialog Component
 * 
 * Shows permission requests with arrow key navigation like gemini-cli
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface PermissionDialogProps {
  request: any;
  onClose: () => void;
}

export function PermissionDialog({ request, onClose }: PermissionDialogProps) {
  const options = [
    { key: 'allow', label: 'Allow once', color: 'green', value: true },
    { key: 'always', label: 'Always allow for session', color: 'blue', value: true },
    { key: 'deny', label: 'Deny', color: 'red', value: false }
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      if (request.resolve) {
        request.resolve(false);
      }
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => (prev - 1 + options.length) % options.length);
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => (prev + 1) % options.length);
      return;
    }

    if (key.return) {
      if (request.resolve) {
        request.resolve(options[selectedIndex].value);
      }
      onClose();
      return;
    }
  });
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'safe': return 'green';
      case 'moderate': return 'yellow';
      case 'dangerous': return 'red';
      default: return 'white';
    }
  };

  const getRiskEmoji = (risk: string) => {
    switch (risk) {
      case 'safe': return '✅';
      case 'moderate': return '⚠️';
      case 'dangerous': return '🚨';
      default: return '❓';
    }
  };

  return (
    <Box 
      borderStyle="double"
      borderColor="yellow"
      padding={1}
      marginX={2}
      marginY={1}
    >
      <Box flexDirection="column">
        <Text color="yellow" bold>🔐 Permission Request</Text>
        
        <Box marginTop={1}>
          <Text color="cyan" bold>Tool:</Text>
          <Text color="white"> {request.toolName || 'Unknown Tool'}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="white">{request.description || request.reason || 'No description available'}</Text>
        </Box>

        {request.params && Object.keys(request.params).length > 0 && (
          <Box marginTop={1} borderStyle="single" borderColor="cyan" padding={1}>
            <Text color="cyan" bold>Command Details:</Text>
            {Object.entries(request.params).map(([key, value]) => (
              <Box key={key} marginTop={0}>
                <Text color="yellow">{key}:</Text>
                <Text color="white" wrap="wrap"> {typeof value === 'string' ? value : JSON.stringify(value)}</Text>
              </Box>
            ))}
          </Box>
        )}

        {request.risk && (
          <Box marginTop={1}>
            <Text color={getRiskColor(request.risk)}>
              {getRiskEmoji(request.risk)} Risk Level: {request.risk.toUpperCase()}
            </Text>
          </Box>
        )}

        {request.preview && (
          <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
            <Text color="gray">Preview:</Text>
            <Text wrap="wrap">{request.preview}</Text>
          </Box>
        )}

        <Box marginTop={2} flexDirection="column">
          <Text color="white" bold>Choose an option (↑↓ to navigate, Enter to select):</Text>
          {options.map((option, index) => (
            <Box key={option.key} marginTop={1}>
              <Text color={index === selectedIndex ? 'black' : option.color as any}
                    backgroundColor={index === selectedIndex ? option.color as any : undefined}>
                {index === selectedIndex ? '▶ ' : '  '}
                {option.label}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text color="gray">💡 Press ESC to deny, ↑↓ to navigate, Enter to confirm</Text>
        </Box>
      </Box>
    </Box>
  );
}