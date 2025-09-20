/**
 * Status Bar Component
 * 
 * Shows current model, session info, and connection status
 */

import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  model: string;
  sessionId: string;
  isLoading: boolean;
}

export function StatusBar({ model, sessionId, isLoading }: StatusBarProps) {
  const shortSessionId = sessionId.slice(-8);
  const status = isLoading ? '🔄' : '✅';
  
  return (
    <Box 
      borderStyle="single" 
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color="green">🚀 Numidium-Local</Text>
        <Text color="gray"> | </Text>
        <Text color="blue">Model: {model}</Text>
      </Box>
      
      <Box>
        <Text color="gray">Session: {shortSessionId}</Text>
        <Text color="gray"> | </Text>
        <Text color={isLoading ? 'yellow' : 'green'}>
          {status} {isLoading ? 'Processing' : 'Ready'}
        </Text>
      </Box>
    </Box>
  );
}