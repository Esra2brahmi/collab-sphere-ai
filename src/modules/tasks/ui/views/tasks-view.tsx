"use client";

import { useState, useEffect } from "react";
import { AIProjectPlan, ProjectPhase, Task } from "../../types";
import { KanbanBoard } from "../components/kanban-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, BarChart3, Users, Calendar, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TasksViewProps {
  meetingId: string;
}

export const TasksView = ({ meetingId }: TasksViewProps) => {
  const [aiProjectPlan, setAiProjectPlan] = useState<AIProjectPlan | null>(null);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [suggestedAssignees, setSuggestedAssignees] = useState<any[]>([]);
  const [workloadAnalysis, setWorkloadAnalysis] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceUsed, setSourceUsed] = useState<"summary" | "transcript" | "unknown" | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState<boolean>(false);
  const { toast } = useToast();

  // Load existing AI project plan and tasks
  useEffect(() => {
    loadExistingPlan();
    loadTasks();
  }, [meetingId]);

  const loadExistingPlan = async () => {
    try {
      const response = await fetch(`/api/ai-project-plan?meetingId=${meetingId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded AI project plan data:', data);
        
        setAiProjectPlan(data.projectPlan);
        setPhases(data.phases || []);
        setSuggestedAssignees(data.suggestedAssignees || []);
        setWorkloadAnalysis(data.workloadAnalysis || null);
        // If backend starts returning these, capture them; else default
        if (typeof data.sourceUsed === 'string') {
          setSourceUsed((data.sourceUsed === 'summary' || data.sourceUsed === 'transcript') ? data.sourceUsed : 'unknown');
        } else {
          setSourceUsed('unknown');
        }
        setFallbackUsed(Boolean(data.fallbackUsed));
      } else {
        console.log('No existing plan found, will need to generate one');
      }
    } catch (error) {
      console.error('Failed to load existing plan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      const response = await fetch(`/api/tasks?meetingId=${meetingId}`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const generateAIProjectPlan = async () => {
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/ai-project-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiProjectPlan(data.projectPlan);
        setPhases(data.phases || []);
        setSuggestedAssignees(data.suggestedAssignees || []);
        setWorkloadAnalysis(data.workloadAnalysis || null);
        setSourceUsed((data.sourceUsed === 'summary' || data.sourceUsed === 'transcript') ? data.sourceUsed : 'unknown');
        setFallbackUsed(Boolean(data.fallbackUsed));
        
        toast({
          title: "Success",
          description: `AI project plan generated from ${data.sourceUsed || 'unknown'}${data.fallbackUsed ? ' (fallback used)' : ''}.`,
        });
      } else {
        throw new Error('Failed to generate project plan');
      }
    } catch (error) {
      console.error('Failed to generate AI project plan:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI project plan",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    console.log('handleTaskUpdate called with:', { taskId, updates });
    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, ...updates }),
      });

      if (response.ok) {
        // Prefer server response to reflect any backend normalization (e.g., phase validation)
        const data = await response.json();
        const updatedTask: Task = data.task;
        console.log('Server returned updated task:', updatedTask);
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
        // Also re-fetch tasks and phases from server to ensure complete consistency
        await Promise.all([
          loadTasks(),
          loadExistingPlan(),
        ]);
        
        toast({
          title: "Success",
          description: "Task updated successfully",
        });
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    }
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI-Assisted Task Management</h1>
          <p className="text-gray-600 mt-2">
            Intelligent project planning and task management powered by AI
          </p>
        </div>
        
        {!aiProjectPlan && (
          <Button
            onClick={generateAIProjectPlan}
            disabled={isGenerating}
            className="flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? 'Generating...' : 'Generate AI Project Plan'}
          </Button>
        )}
      </div>

      {/* AI Project Plan Overview */}
      {aiProjectPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              AI-Generated Project Plan
              {sourceUsed && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Based on {sourceUsed}
                </Badge>
              )}
              {fallbackUsed && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  Fallback
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Project Phases */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Project Phases</h3>
                <div className="space-y-2">
                  {phases.map((phase, index) => (
                    <div key={phase.id} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: phase.color }}
                      />
                      <span className="text-sm">{phase.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {phase.tasks?.length || 0} tasks
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workload Analysis */}
              {workloadAnalysis && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">Workload Overview</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                      <span>Total Tasks: {workloadAnalysis.totalTasks}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-green-600" />
                      <span>Est. Hours: {workloadAnalysis.estimatedTotalHours}h</span>
                    </div>
                    {workloadAnalysis.recommendations && workloadAnalysis.recommendations.length > 0 && (
                      <div className="pt-2">
                        <div className="flex items-center gap-2 text-sm font-medium mb-2">
                          <AlertTriangle className="h-4 w-4 text-orange-600" />
                          Key Recommendations
                        </div>
                        <ul className="text-xs text-gray-600 space-y-1">
                          {workloadAnalysis.recommendations.slice(0, 2).map((rec: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-blue-600">•</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Team Overview */}
              {suggestedAssignees.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">Team Overview</h3>
                  <div className="space-y-2">
                    {suggestedAssignees.slice(0, 3).map((assignee, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-purple-600" />
                          <span className="truncate">{assignee.userName}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {Math.round((assignee.currentWorkload / assignee.maxWorkload) * 100)}%
                        </Badge>
                      </div>
                    ))}
                    {suggestedAssignees.length > 3 && (
                      <div className="text-xs text-gray-500 text-center">
                        +{suggestedAssignees.length - 3} more team members
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="kanban" className="space-y-4">
        <TabsList>
          <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
          {aiProjectPlan && (
            <>
              <TabsTrigger value="phases">Project Phases</TabsTrigger>
              <TabsTrigger value="team">Team Analysis</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="kanban" className="space-y-4">
          {phases.length > 0 ? (
            <>
              {console.log('Rendering Kanban board with phases:', phases.map(p => ({ id: p.id, name: p.name, fullPhase: p })))}
              <KanbanBoard
                meetingId={meetingId}
                phases={phases}
                tasks={tasks}
                onTaskUpdate={handleTaskUpdate}
                onTaskCreate={handleTaskCreate}
                onTaskDelete={handleTaskDelete}
              />
            </>
          ) : (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Project Plan Yet</h3>
              <p className="text-gray-600 mb-4">
                Generate an AI-powered project plan to get started with task management.
              </p>
              <Button onClick={generateAIProjectPlan} disabled={isGenerating}>
                <Sparkles className="h-4 w-4 mr-2" />
                {isGenerating ? 'Generating...' : 'Generate AI Project Plan'}
              </Button>
            </div>
          )}
        </TabsContent>

        {aiProjectPlan && (
          <>
            <TabsContent value="phases" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {phases.map((phase) => (
                  <Card key={phase.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: phase.color }}
                        />
                        {phase.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {phase.tasks?.map((task, index) => (
                          <div key={index} className="p-3 border rounded-lg">
                            <div className="font-medium text-sm mb-1">{task.title}</div>
                            {task.description && (
                              <p className="text-xs text-gray-600 mb-2">{task.description}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {task.priority}
                              </Badge>
                              {task.estimatedHours && (
                                <Badge variant="secondary" className="text-xs">
                                  {task.estimatedHours}h
                                </Badge>
                              )}
                              {((task as any)?.suggestedAssignee) && (
                                <Badge variant="outline" className="text-xs">
                                  {(task as any).suggestedAssignee}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                        {(!phase.tasks || phase.tasks.length === 0) && (
                          <p className="text-sm text-gray-500 text-center py-4">
                            No tasks in this phase
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="team" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {suggestedAssignees.map((assignee, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{assignee.userName}</span>
                        <Badge variant="outline">{assignee.role}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>Confidence:</span>
                          <span className="font-medium">{Math.round(assignee.confidence * 100)}%</span>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>Current Workload:</span>
                            <span>{assignee.currentWorkload}h</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (assignee.currentWorkload / assignee.maxWorkload) >= 0.9 ? 'bg-red-500' :
                                (assignee.currentWorkload / assignee.maxWorkload) >= 0.75 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min((assignee.currentWorkload / assignee.maxWorkload) * 100, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500 text-right">
                            Max: {assignee.maxWorkload}h
                          </div>
                        </div>

                        <div className="pt-2">
                          <div className="text-sm font-medium mb-2">Expertise:</div>
                          <div className="flex flex-wrap gap-1">
                            {assignee.expertise.map((skill: string, skillIndex: number) => (
                              <Badge key={skillIndex} variant="secondary" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2">
                          <div className="text-sm font-medium mb-2">Reasoning:</div>
                          <p className="text-xs text-gray-600">{assignee.reasoning}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}; 