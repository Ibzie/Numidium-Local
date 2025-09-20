/**
 * Task Tracker Tool - TodoWrite Style
 * 
 * Provides task tracking functionality similar to Claude Code's TodoWrite tool
 */

export interface Task {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
  timestamp: Date;
  id: string;
}

export interface TaskUpdate {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export class TaskTracker {
  private tasks: Map<string, Task> = new Map();
  private currentSession: string;

  constructor(sessionId: string) {
    this.currentSession = sessionId;
  }

  /**
   * Add or update multiple tasks (TodoWrite style)
   */
  updateTasks(taskUpdates: TaskUpdate[]): Task[] {
    // Clear existing tasks and replace with new set
    this.tasks.clear();

    const updatedTasks: Task[] = [];

    for (const update of taskUpdates) {
      const task: Task = {
        id: this.generateTaskId(update.content),
        content: update.content,
        status: update.status,
        activeForm: update.activeForm,
        timestamp: new Date()
      };

      this.tasks.set(task.id, task);
      updatedTasks.push(task);
    }

    return updatedTasks;
  }

  /**
   * Get current task list
   */
  getCurrentTasks(): Task[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get task summary for display
   */
  getTaskSummary(): string {
    const tasks = this.getCurrentTasks();
    if (tasks.length === 0) return 'No active tasks';

    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;

    return `Tasks: ${completed}✅ ${inProgress}🔄 ${pending}⏳`;
  }

  /**
   * Format tasks for AI context
   */
  getTasksForContext(): string {
    const tasks = this.getCurrentTasks();
    if (tasks.length === 0) return 'No current tasks';

    return tasks.map(task => {
      const statusEmoji = this.getStatusEmoji(task.status);
      const activeText = task.status === 'in_progress' ? ` (${task.activeForm})` : '';
      return `${statusEmoji} ${task.content}${activeText}`;
    }).join('\n');
  }

  /**
   * Create task tracking prompt for AI
   */
  getTaskTrackingPrompt(): string {
    return `
TASK MANAGEMENT:
Use task tracking to organize multi-step work. When working on complex requests:

1. Break down the work into specific tasks
2. Mark tasks as in_progress before starting
3. Mark tasks as completed immediately after finishing
4. Update task list as new requirements emerge

Current tasks:
${this.getTasksForContext()}

Always use task tracking for requests that involve multiple steps or when planning complex work.`;
  }

  /**
   * Analyze request and suggest tasks
   */
  suggestTasksFromRequest(userRequest: string): TaskUpdate[] {
    const suggestions: TaskUpdate[] = [];

    // Detect common patterns that require task tracking
    if (this.isComplexRequest(userRequest)) {
      suggestions.push(...this.breakDownRequest(userRequest));
    }

    return suggestions;
  }

  /**
   * Check if request should use task tracking
   */
  shouldUseTaskTracking(userRequest: string): boolean {
    const complexityIndicators = [
      'create', 'build', 'implement', 'setup', 'configure',
      'multiple', 'several', 'steps', 'and', 'then',
      'project', 'application', 'system', 'workflow'
    ];

    const wordCount = userRequest.split(' ').length;
    const hasComplexityIndicators = complexityIndicators.some(
      indicator => userRequest.toLowerCase().includes(indicator)
    );

    return wordCount > 10 || hasComplexityIndicators;
  }

  private generateTaskId(content: string): string {
    return content.toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 30) + '_' + Date.now().toString(36);
  }

  private getStatusEmoji(status: Task['status']): string {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'pending': return '⏳';
      default: return '•';
    }
  }

  private isComplexRequest(request: string): boolean {
    const complexPatterns = [
      /create.*and.*then/i,
      /build.*with.*features/i,
      /implement.*including/i,
      /setup.*project/i,
      /\d+.*steps?/i
    ];

    return complexPatterns.some(pattern => pattern.test(request));
  }

  private breakDownRequest(request: string): TaskUpdate[] {
    const tasks: TaskUpdate[] = [];

    // Common development task patterns
    if (request.includes('create') || request.includes('build')) {
      if (request.includes('file') || request.includes('component')) {
        tasks.push({
          content: 'Create required files',
          status: 'pending',
          activeForm: 'Creating required files'
        });
      }

      if (request.includes('test')) {
        tasks.push({
          content: 'Write tests',
          status: 'pending',
          activeForm: 'Writing tests'
        });
      }

      if (request.includes('document')) {
        tasks.push({
          content: 'Create documentation',
          status: 'pending',
          activeForm: 'Creating documentation'
        });
      }
    }

    if (request.includes('setup') || request.includes('configure')) {
      tasks.push({
        content: 'Setup project configuration',
        status: 'pending',
        activeForm: 'Setting up project configuration'
      });
    }

    // If no specific tasks identified, create generic breakdown
    if (tasks.length === 0) {
      tasks.push(
        {
          content: 'Analyze requirements',
          status: 'pending',
          activeForm: 'Analyzing requirements'
        },
        {
          content: 'Implement solution',
          status: 'pending',
          activeForm: 'Implementing solution'
        },
        {
          content: 'Test and validate',
          status: 'pending',
          activeForm: 'Testing and validating'
        }
      );
    }

    return tasks;
  }
}

/**
 * Task tracking utility functions
 */
export const TaskUtils = {
  /**
   * Format task status change for display
   */
  formatTaskStatusChange(task: Task, previousStatus?: Task['status']): string {
    if (previousStatus && previousStatus !== task.status) {
      const fromEmoji = TaskUtils.getStatusEmoji(previousStatus);
      const toEmoji = TaskUtils.getStatusEmoji(task.status);
      return `${fromEmoji} → ${toEmoji} ${task.content}`;
    }
    return `${TaskUtils.getStatusEmoji(task.status)} ${task.content}`;
  },

  /**
   * Get status emoji
   */
  getStatusEmoji(status: Task['status']): string {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'pending': return '⏳';
      default: return '•';
    }
  },

  /**
   * Create task update from partial data
   */
  createTaskUpdate(
    content: string, 
    status: Task['status'] = 'pending',
    activeForm?: string
  ): TaskUpdate {
    return {
      content,
      status,
      activeForm: activeForm || content.charAt(0).toUpperCase() + content.slice(1).toLowerCase()
    };
  }
};