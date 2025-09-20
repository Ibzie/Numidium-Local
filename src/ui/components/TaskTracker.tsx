/**
 * Task Tracker Component
 * 
 * TodoWrite-style task tracking display
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Task } from '../../tools/taskTracker.js';

interface TaskTrackerProps {
  tasks: Task[];
  onClose: () => void;
}

export function TaskTracker({ tasks, onClose }: TaskTrackerProps) {
  useInput((input, key) => {
    if (key.escape || input === 'x') {
      onClose();
      return;
    }
  });

  const getStatusEmoji = (status: Task['status']) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'pending': return '⏳';
      default: return '•';
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed': return 'green';
      case 'in_progress': return 'yellow';
      case 'pending': return 'gray';
      default: return 'white';
    }
  };

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;

  return (
    <Box 
      borderStyle="single"
      borderColor="blue"
      padding={1}
      marginY={1}
    >
      <Box flexDirection="column">
        <Text color="blue" bold>📋 Task Progress</Text>
        <Text color="gray">
          Progress: {completedTasks}✅ {inProgressTasks}🔄 {pendingTasks}⏳ | Press ESC to close
        </Text>
        
        <Box flexDirection="column" marginTop={1}>
          {tasks.map((task, index) => (
            <Box key={task.id} marginBottom={0}>
              <Text color={getStatusColor(task.status)}>
                {getStatusEmoji(task.status)} {task.content}
              </Text>
              {task.status === 'in_progress' && (
                <Box marginLeft={2}>
                  <Text color="yellow">
                    ({task.activeForm})
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>

        {tasks.length === 0 && (
          <Box marginTop={1}>
            <Text color="gray">No active tasks</Text>
          </Box>
        )}
        
        <Box marginTop={1}>
          <Text color="gray">💡 Tasks automatically track complex work progress</Text>
        </Box>
      </Box>
    </Box>
  );
}