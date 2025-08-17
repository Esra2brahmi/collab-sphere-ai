export interface Task {
  id: string;
  title: string;
  description?: string;
  phase: string;
  status: 'todo' | 'in-progress' | 'done';
  assignee?: string;
  assigneeId?: string;
  priority: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  dueDate?: Date;
  subtasks: Subtask[];
  aiGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
  meetingId: string;
  tags: string[];
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  aiGenerated: boolean;
}

export interface ProjectPhase {
  id: string;
  name: string;
  order: number;
  color: string;
  tasks: Task[];
}

export interface AIProjectPlan {
  id: string;
  meetingId: string;
  phases: ProjectPhase[];
  suggestedAssignees: SuggestedAssignee[];
  workloadAnalysis: WorkloadAnalysis;
  createdAt: Date;
}

export interface SuggestedAssignee {
  userId: string;
  userName: string;
  role: string;
  confidence: number;
  reasoning: string;
  currentWorkload: number;
  maxWorkload: number;
  emotionalState: 'positive' | 'neutral' | 'negative';
  expertise: string[];
}

export interface WorkloadAnalysis {
  totalTasks: number;
  estimatedTotalHours: number;
  workloadDistribution: Record<string, number>;
  recommendations: string[];
}

export interface TaskCreationRequest {
  title: string;
  description?: string;
  phase: string;
  assigneeId?: string;
  priority: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  dueDate?: Date;
  meetingId: string;
  tags?: string[];
}

export interface AITaskSuggestion {
  title: string;
  description: string;
  reasoning: string;
  estimatedHours: number;
  priority: 'low' | 'medium' | 'high';
  suggestedAssignee?: string;
} 