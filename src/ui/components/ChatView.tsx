/**
 * Chat View Component
 * 
 * Displays conversation history with proper formatting and scrolling
 */

import React from 'react';
import { Box, Text } from 'ink';
import { format } from 'date-fns';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatViewProps {
  messages: Message[];
  isLoading: boolean;
}

export function ChatView({ messages, isLoading }: ChatViewProps) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {messages.map((message, index) => (
        <MessageItem key={index} message={message} />
      ))}
      
      {isLoading && (
        <Box marginTop={1}>
          <Text color="yellow">🤔 Thinking...</Text>
        </Box>
      )}
    </Box>
  );
}

function MessageItem({ message }: { message: Message }) {
  const timeStr = format(message.timestamp, 'HH:mm:ss');
  
  const getMessageColor = (role: string) => {
    switch (role) {
      case 'user': return 'cyan';
      case 'assistant': return 'green';
      case 'system': return 'yellow';
      default: return 'white';
    }
  };

  const getMessagePrefix = (role: string) => {
    switch (role) {
      case 'user': return '❯';
      case 'assistant': return '🤖';
      case 'system': return 'ℹ️';
      default: return '•';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="gray">[{timeStr}] </Text>
        <Text color={getMessageColor(message.role)}>
          {getMessagePrefix(message.role)} {message.role}:
        </Text>
      </Box>
      <Box paddingLeft={2}>
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    </Box>
  );
}