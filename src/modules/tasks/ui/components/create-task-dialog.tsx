"use client";

import { useState, useEffect } from "react";
import { ProjectPhase, TaskCreationRequest, SuggestedAssignee } from "../../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, User, Sparkles, AlertTriangle } from "lucide-react";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phases: ProjectPhase[];
  meetingId: string;
  onSubmit: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const CreateTaskDialog = ({
  open,
  onOpenChange,
  phases,
  meetingId,
  onSubmit,
}: CreateTaskDialogProps) => {
  const [formData, setFormData] = useState<Partial<TaskCreationRequest>>({
    title: '',
    description: '',
    phase: '',
    priority: 'medium',
    estimatedHours: undefined,
    dueDate: undefined,
    meetingId,
    tags: [],
  });
  
  const [suggestedAssignees, setSuggestedAssignees] = useState<SuggestedAssignee[]>([]);
  const [workloadAnalysis, setWorkloadAnalysis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newTag, setNewTag] = useState('');

  // Load AI suggestions when dialog opens
  useEffect(() => {
    if (open && meetingId) {
      loadAISuggestions();
    }
  }, [open, meetingId]);

  const loadAISuggestions = async () => {
    try {
      const response = await fetch(`/api/ai-project-plan?meetingId=${meetingId}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestedAssignees(data.suggestedAssignees || []);
        setWorkloadAnalysis(data.workloadAnalysis || null);
      }
    } catch (error) {
      console.error('Failed to load AI suggestions:', error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.phase) {
      return;
    }

    setIsLoading(true);
    
    // Convert form data to task format
    const taskData = {
      ...formData,
      subtasks: [],
      aiGenerated: false,
    } as Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

    onSubmit(taskData);
    setIsLoading(false);
    onOpenChange(false);
    
    // Reset form
    setFormData({
      title: '',
      description: '',
      phase: '',
      priority: 'medium',
      estimatedHours: undefined,
      dueDate: undefined,
      meetingId,
      tags: [],
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags?.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()],
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || [],
    }));
  };

  const getWorkloadStatus = (assignee: SuggestedAssignee) => {
    const workloadPercentage = (assignee.currentWorkload / assignee.maxWorkload) * 100;
    if (workloadPercentage >= 90) return 'critical';
    if (workloadPercentage >= 75) return 'warning';
    return 'good';
  };

  const getWorkloadColor = (status: string) => {
    switch (status) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Task Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter task title"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what needs to be done"
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phase">Phase *</Label>
                <Select
                  value={formData.phase}
                  onValueChange={(value) => setFormData({ ...formData, phase: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {phases.map((phase) => (
                      <SelectItem key={phase.id} value={phase.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: phase.color }}
                          />
                          {phase.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value as any })}
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
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimatedHours">Estimated Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={formData.estimatedHours || ''}
                  onChange={(e) => setFormData({ ...formData, estimatedHours: parseFloat(e.target.value) || undefined })}
                  placeholder="e.g., 8"
                />
              </div>
              
              <div>
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate || ''}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value || undefined })}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
              {formData.tags && formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-red-600"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AI-Powered Suggestions */}
          {suggestedAssignees.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold">AI Assignment Suggestions</h3>
              </div>
              
              <div className="grid gap-3">
                {suggestedAssignees.map((assignee, index) => {
                  const workloadStatus = getWorkloadStatus(assignee);
                  const workloadColor = getWorkloadColor(workloadStatus);
                  
                  return (
                    <Card key={index} className="cursor-pointer hover:bg-gray-50" 
                          onClick={() => setFormData({ ...formData, assigneeId: assignee.userId })}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{assignee.userName}</h4>
                              <Badge variant="outline" className="text-xs">
                                {assignee.role}
                              </Badge>
                              <Badge className={`text-xs ${workloadColor}`}>
                                {Math.round((assignee.currentWorkload / assignee.maxWorkload) * 100)}% workload
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{assignee.reasoning}</p>
                            <div className="flex flex-wrap gap-1">
                              {assignee.expertise.slice(0, 3).map((skill, skillIndex) => (
                                <Badge key={skillIndex} variant="secondary" className="text-xs">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-sm text-gray-500 mb-1">
                              Confidence: {Math.round(assignee.confidence * 100)}%
                            </div>
                            <div className="flex items-center gap-1 text-xs">
                              <span className={`w-2 h-2 rounded-full ${
                                assignee.emotionalState === 'positive' ? 'bg-green-500' :
                                assignee.emotionalState === 'negative' ? 'bg-red-500' : 'bg-yellow-500'
                              }`} />
                              {assignee.emotionalState}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Workload Analysis */}
          {workloadAnalysis && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <h3 className="font-semibold">Workload Analysis</h3>
              </div>
              
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{workloadAnalysis.totalTasks}</div>
                      <div className="text-sm text-gray-600">Total Tasks</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{workloadAnalysis.estimatedTotalHours}h</div>
                      <div className="text-sm text-gray-600">Estimated Hours</div>
                    </div>
                  </div>
                  
                  {workloadAnalysis.recommendations && workloadAnalysis.recommendations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Recommendations:</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {workloadAnalysis.recommendations.map((rec: string, index: number) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-blue-600">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.title || !formData.phase}>
              {isLoading ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}; 