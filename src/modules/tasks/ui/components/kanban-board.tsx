"use client";

import { useState } from "react";
import { Task, ProjectPhase } from "../../types";
import { TaskCard } from "./task-card";
import { CreateTaskDialog } from "./create-task-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface KanbanBoardProps {
  meetingId: string;
  phases: ProjectPhase[];
  tasks: Task[];
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
  tasks,
  onTaskUpdate, 
  onTaskCreate, 
  onTaskDelete 
}: KanbanBoardProps) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  // Group tasks by status
  const tasksByStatus = {
    'todo': tasks.filter(task => task.status === 'todo'),
    'in-progress': tasks.filter(task => task.status === 'in-progress'),
    'done': tasks.filter(task => task.status === 'done'),
  };

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
    }
    
    setDraggedTask(null);
  };

  const handleTaskUpdate = (taskId: string, updates: Partial<Task>) => {
    onTaskUpdate(taskId, updates);
  };

  const handleTaskCreate = async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    onTaskCreate(taskData);
    setIsCreateDialogOpen(false);
  };

  const handleTaskDelete = async (taskId: string) => {
    onTaskDelete(taskId);
  };

  const getPhaseName = (phaseId: string) => {
    console.log('getPhaseName called with:', { 
      phaseId, 
      phaseIdType: typeof phaseId,
      availablePhases: phases.map(p => ({ id: p.id, name: p.name, idType: typeof p.id })) 
    });
    const phase = phases.find(p => p.id === phaseId);
    console.log('Found phase:', phase);
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
                  phases={phases}
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