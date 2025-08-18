"use client";

import { useState, useEffect } from "react";
import { Task, Subtask, AITaskSuggestion, ProjectPhase } from "../../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, User, Tag, Edit, Trash2, Plus, Sparkles, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TaskCardProps {
  task: Task;
  phases: ProjectPhase[];
  phaseName: string;
  phaseColor: string;
  onUpdate: (taskId: string, updates: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  onDragStart: (e: React.DragEvent) => void;
}

const PRIORITY_COLORS = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

export const TaskCard = ({ 
  task,
  phases,
  phaseName, 
  phaseColor, 
  onUpdate, 
  onDelete, 
  onDragStart 
}: TaskCardProps) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSubtaskDialogOpen, setIsSubtaskDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Task>(task);
  const [newSubtask, setNewSubtask] = useState('');
  const [aiSubtaskSuggestions, setAiSubtaskSuggestions] = useState<AITaskSuggestion[]>([]);
  const { toast } = useToast();

  // When opening the edit dialog, sync edit state to the latest task values
  useEffect(() => {
    if (isEditDialogOpen) {
      setEditData(task);
    }
  }, [isEditDialogOpen, task]);

  const handleUpdate = () => {
    onUpdate(task.id, editData);
    setIsEditDialogOpen(false);
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;

    try {
      const response = await fetch('/api/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          title: newSubtask,
          aiGenerated: false,
        }),
      });

      if (response.ok) {
        const subtask = await response.json();
        const updatedSubtasks = [...task.subtasks, subtask.subtask];
        onUpdate(task.id, { subtasks: updatedSubtasks });
        setNewSubtask('');
        setIsSubtaskDialogOpen(false);
        toast({
          title: "Success",
          description: "Subtask added successfully",
        });
      }
    } catch (error) {
      console.error('Failed to add subtask:', error);
      toast({
        title: "Error",
        description: "Failed to add subtask",
        variant: "destructive",
      });
    }
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    try {
      const response = await fetch('/api/subtasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: subtaskId,
          completed: !task.subtasks.find(s => s.id === subtaskId)?.completed,
        }),
      });

      if (response.ok) {
        const updatedSubtasks = task.subtasks.map(s => 
          s.id === subtaskId 
            ? { ...s, completed: !s.completed }
            : s
        );
        onUpdate(task.id, { subtasks: updatedSubtasks });
      }
    } catch (error) {
      console.error('Failed to toggle subtask:', error);
    }
  };

  const handleGetAISuggestions = async () => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          phase: task.phase,
          meetingId: task.meetingId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.aiSubtaskSuggestions) {
          setAiSubtaskSuggestions(data.aiSubtaskSuggestions);
        }
      }
    } catch (error) {
      console.error('Failed to get AI suggestions:', error);
    }
  };

  const handleAddAISubtask = (suggestion: AITaskSuggestion) => {
    setNewSubtask(suggestion.title);
    setAiSubtaskSuggestions([]);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString();
  };

  const safeSubtasks: Subtask[] = Array.isArray(task.subtasks) ? task.subtasks : [];
  const completedSubtasks = safeSubtasks.filter((s) => s.completed).length;
  const totalSubtasks = safeSubtasks.length;

  return (
    <>
      <Card 
        className="cursor-move hover:shadow-md transition-shadow"
        draggable
        onDragStart={onDragStart}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-sm font-medium line-clamp-2">
                {task.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge 
                  variant="secondary" 
                  className="text-xs"
                  style={{ backgroundColor: phaseColor, color: 'white' }}
                >
                  {phaseName}
                </Badge>
                <Badge 
                  variant="secondary" 
                  className={`text-xs ${PRIORITY_COLORS[task.priority]}`}
                >
                  {task.priority}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditDialogOpen(true)}
                className="h-6 w-6 p-0"
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(task.id)}
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          {task.description && (
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              {task.description}
            </p>
          )}
          
          <div className="space-y-2">
            {task.assignee && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <User className="h-3 w-3" />
                <span>{task.assignee}</span>
              </div>
            )}
            
            {task.estimatedHours && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Clock className="h-3 w-3" />
                <span>{task.estimatedHours}h</span>
              </div>
            )}
            
            {task.dueDate && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(task.dueDate)}</span>
              </div>
            )}
            
            {totalSubtasks > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <CheckCircle className="h-3 w-3" />
                <span>{completedSubtasks}/{totalSubtasks} subtasks</span>
              </div>
            )}
          </div>
          
          {task.tags && task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {task.tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSubtaskDialogOpen(true)}
              className="h-6 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Subtask
            </Button>
            {task.aiGenerated && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Generated
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Task Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editData.description || ''}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phase">Phase</Label>
                <select
                  id="phase"
                  className="w-full border rounded-md h-10 px-3 bg-white"
                  value={editData.phase}
                  onChange={(e) => {
                    console.log('Phase selector changed:', { selectedValue: e.target.value, selectedText: e.target.options[e.target.selectedIndex].text });
                    setEditData({ ...editData, phase: e.target.value });
                  }}
                >
                  <option value="" disabled>Select phase</option>
                  {phases.map((p) => {
                    console.log('Rendering phase option:', { id: p.id, name: p.name });
                    return (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    );
                  })}
                </select>
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={editData.priority}
                  onValueChange={(value) => setEditData({ ...editData, priority: value as Task['priority'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="estimatedHours">Est. Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  value={editData.estimatedHours || ''}
                  onChange={(e) => setEditData({ ...editData, estimatedHours: parseInt(e.target.value) || undefined })}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={editData.dueDate ? formatDate(editData.dueDate) : ''}
                onChange={(e) => setEditData({ ...editData, dueDate: e.target.value ? new Date(e.target.value) : undefined })}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>
              Update Task
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Subtask Dialog */}
      <Dialog open={isSubtaskDialogOpen} onOpenChange={setIsSubtaskDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subtask</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="subtask">Subtask Title</Label>
              <Input
                id="subtask"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Enter subtask title"
              />
            </div>
            
            {aiSubtaskSuggestions.length > 0 && (
              <div>
                <Label className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Suggestions
                </Label>
                <div className="space-y-2 mt-2">
                  {aiSubtaskSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                      onClick={() => handleAddAISubtask(suggestion)}
                    >
                      <div className="font-medium text-sm">{suggestion.title}</div>
                      <div className="text-xs text-gray-600 mt-1">{suggestion.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGetAISuggestions}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Get AI Suggestions
              </Button>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsSubtaskDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSubtask} disabled={!newSubtask.trim()}>
              Add Subtask
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}; 