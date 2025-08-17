"use client";

import { useState, useEffect } from "react";
import { Task, ProjectPhase, AITaskSuggestion } from "../../types";
import { TaskCard } from "./task-card";
import { CreateTaskDialog } from "./create-task-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KanbanBoardProps {
  meetingId: string;
  phases: ProjectPhase[];
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
  onTaskCreate: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onTaskDelete: (taskId: string) => void;
}

const COLUMN_CONFIG = {
  'todo': { title: 'To Do', color: '#6B7280' },
  'in-progress': { title: 'In Progress', color: '#3B82F6' },
  'done': { title: 'Done', color: '#10B981' },
};

export const KanbanBoard = ({ 
  meetingId, 
  phases, 
  onTaskUpdate, 
  onTaskCreate, 
  onTaskDelete 
}: KanbanBoardProps) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<string>('');
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const { toast } = useToast();

  // Group tasks by status
  const tasksByStatus = {
    'todo': tasks.filter(task => task.status === 'todo'),
    'in-progress': tasks.filter(task => task.status === 'in-progress'),
    'done': tasks.filter(task => task.status === 'done'),
  };

  // Load tasks from API
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const response = await fetch(`/api/tasks?meetingId=${meetingId}`);
        if (response.ok) {
          const data = await response.json();
          setTasks(data.tasks || []);
        }
      } catch (error) {
        console.error('Failed to load tasks:', error);
        toast({
          title: "Error",
          description: "Failed to load tasks",
          variant: "destructive",
        });
      }
    };

    loadTasks();
  }, [meetingId, toast]);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    
    if (draggedTask && draggedTask.status !== status) {
      onTaskUpdate(draggedTask.id, { status: status as Task['status'] });
      
      // Update local state
      setTasks(prev => prev.map(task => 
        task.id === draggedTask.id 
          ? { ...task, status: status as Task['status'] }
          : task
      ));
    }
    
    setDraggedTask(null);
  };

  const handleTaskUpdate = (taskId: string, updates: Partial<Task>) => {
    onTaskUpdate(taskId, updates);
    
    // Update local state
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, ...updates }
        : task
    ));
  };

  const handleTaskCreate = async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });

      if (response.ok) {
        const data = await response.json();
        const newTask = data.task;
        
        // Add to local state
        setTasks(prev => [...prev, newTask]);
        
        // Show AI subtask suggestions if available
        if (data.aiSubtaskSuggestions && data.aiSubtaskSuggestions.length > 0) {
          toast({
            title: "AI Suggestions Available",
            description: `${data.aiSubtaskSuggestions.length} subtask suggestions generated. Check the task details to add them.`,
          });
        }
        
        setIsCreateDialogOpen(false);
        toast({
          title: "Success",
          description: "Task created successfully",
        });
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
    }
  };

  const handleTaskDelete = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks?taskId=${taskId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from local state
        setTasks(prev => prev.filter(task => task.id !== taskId));
        onTaskDelete(taskId);
        toast({
          title: "Success",
          description: "Task deleted successfully",
        });
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    }
  };

  const getPhaseName = (phaseId: string) => {
    const phase = phases.find(p => p.id === phaseId);
    return phase?.name || 'Unknown Phase';
  };

  const getPhaseColor = (phaseId: string) => {
    const phase = phases.find(p => p.id === phaseId);
    return phase?.color || '#3B82F6';
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Task button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Project Tasks</h2>
          <p className="text-gray-600">Manage and track project progress</p>
        </div>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Task
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(COLUMN_CONFIG).map(([status, config]) => (
          <div
            key={status}
            className="bg-gray-50 rounded-lg p-4 min-h-[600px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: config.color }}
                />
                <h3 className="font-semibold text-gray-900">{config.title}</h3>
                <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
                  {tasksByStatus[status as keyof typeof tasksByStatus].length}
                </span>
              </div>
            </div>

            {/* Task Cards */}
            <div className="space-y-3">
              {tasksByStatus[status as keyof typeof tasksByStatus].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  phaseName={getPhaseName(task.phase)}
                  phaseColor={getPhaseColor(task.phase)}
                  onUpdate={handleTaskUpdate}
                  onDelete={handleTaskDelete}
                  onDragStart={(e) => handleDragStart(e, task)}
                />
              ))}
              
              {tasksByStatus[status as keyof typeof tasksByStatus].length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No tasks</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        phases={phases}
        meetingId={meetingId}
        onSubmit={handleTaskCreate}
      />
    </div>
  );
}; 