/**
 * Input Prompt Component
 * 
 * Handles user input with real-time typing and submission
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputPromptProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function InputPrompt({ onSubmit, disabled = false, placeholder = "Type your message...", value, onChange }: InputPromptProps) {
  const [internalInput, setInternalInput] = useState('');
  const input = value !== undefined ? value : internalInput;
  const setInput = value !== undefined ? 
    (val: string | ((prev: string) => string)) => {
      if (typeof val === 'function') {
        onChange?.(val(value));
      } else {
        onChange?.(val);
      }
    } : setInternalInput;
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blink cursor effect
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  useInput((inputChar: string, key: any) => {
    if (disabled) return;

    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev: string) => prev.slice(0, -1));
      return;
    }

    if (key.ctrl && inputChar === 'c') {
      process.exit(0);
    }

    // Handle printable characters
    if (inputChar && !key.ctrl && !key.meta) {
      setInput((prev: string) => prev + inputChar);
    }
  });

  const showCursor = !disabled && cursorVisible;

  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1}>
      <Text color="blue">❯ </Text>
      {input ? (
        <Text color="white">
          {input}
          {showCursor && <Text color="blue">█</Text>}
        </Text>
      ) : (
        <Text color="gray">
          {disabled ? '' : placeholder}
          {showCursor && <Text color="blue">█</Text>}
        </Text>
      )}
    </Box>
  );
}