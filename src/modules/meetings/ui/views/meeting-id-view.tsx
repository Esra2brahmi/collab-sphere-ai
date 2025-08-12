"use client";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { MeetingIdViewHeader } from "../components/meeting-id-view-header";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/use-confirm";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UpdateMeetingDialog } from "../components/update-meeting-dialog";
import { UpcomingState } from "../components/upcoming-state";
import { ActiveState } from "../components/active-state";
import { CancelledState } from "../components/cancelled-state";
import { ProcessingState } from "../components/processing-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


interface Props {
    meetingId: string;
};

export const MeetingIdView = ({meetingId} : Props)=>{
    const trpc = useTRPC();
    const router=useRouter();
    const queryClient=useQueryClient();
    const [updateMeetingDialogOpen,setUpdateMeetingDialogOpen]=useState(false);
    const [RemoveConfirmation,confirmRemove]=useConfirm(
        "Are you sure?",
        "The following action will remove this meeting"
    );
    const {data} = useSuspenseQuery(
        trpc.meetings.getOne.queryOptions({id:meetingId}),
    );
    const removeMeeting=useMutation(
        trpc.meetings.remove.mutationOptions({
            onSuccess:()=>{
                queryClient.invalidateQueries(trpc.meetings.getMany.queryOptions({}));
                router.push("/meetings");
            },        
        }),
    );

    const handleRemoveMeeting = async () => {
        const ok  = await confirmRemove();
        if(!ok) return;
        await removeMeeting.mutateAsync({id:meetingId});
    };

    const isActive = data.status === "active";
    const isUpcoming = data.status === "upcoming";
    const isCancelled = data.status ==="cancelled"
    const isCompleted = data.status ==="completed"
    const isProcessing = data.status ==="processing";

    // Auto-refresh when processing until summary is available
    useEffect(() => {
        if (!isProcessing) return;
        const id = setInterval(() => {
            const q = trpc.meetings.getOne.queryOptions({ id: meetingId }).queryKey;
            queryClient.invalidateQueries({ queryKey: q });
        }, 4000);
        return () => clearInterval(id);
    }, [isProcessing, queryClient, trpc.meetings.getOne, meetingId]);

    // Parse structured summary payload if present
    type InsightsRoleSuggestion = { role: string; user: string; confidence: number; reasoning?: string };
    type InsightsType = {
      source?: 'groq' | 'heuristic' | 'hf-sst2' | 'hybrid';
      sentiment_analysis?: {
        overall_score?: number;
        notes?: string[];
        participants?: Record<string, { avg_sentiment: number; confidence_level?: number }>;
      };
      expertise_detection?: Record<string, Record<string, number>>;
      role_suggestions?: InsightsRoleSuggestion[];
    };
    type ParsedSummary = { summaryText?: string; insights?: InsightsType } | null;

    const parsedSummary: ParsedSummary = useMemo(() => {
        if (!data.summary) return null;
        try {
            const obj = JSON.parse(data.summary as unknown as string);
            if (obj && (obj.summaryText || obj.insights)) return obj as ParsedSummary;
        } catch (_) {}
        return null;
    }, [data.summary]);

    // Typed memo for insights and expertise map to satisfy TS
    const insights = useMemo(() => parsedSummary?.insights as InsightsType | undefined, [parsedSummary]);

    const expertise = useMemo(() => (insights?.expertise_detection ?? undefined) as
      | Record<string, Record<string, number>>
      | undefined,
    [insights]);

    // Actions: download insights JSON and copy summary
    const handleDownloadInsights = useCallback(() => {
      const payload = parsedSummary ? parsedSummary : null;
      if (!payload) return;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-${meetingId}-insights.json`;
      a.click();
      URL.revokeObjectURL(url);
    }, [parsedSummary, meetingId]);

    const handleCopySummary = useCallback(async () => {
      const text = parsedSummary?.summaryText || (data.summary as unknown as string) || '';
      if (!text) return;
      try { await navigator.clipboard.writeText(text); } catch (_) {}
    }, [parsedSummary, data.summary]);


    return (
        <>
        <RemoveConfirmation/>
        <UpdateMeetingDialog
           open={updateMeetingDialogOpen}
           onOpenChange={setUpdateMeetingDialogOpen}
           initialValues={data}
        />
          <div className="flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-4">
            <MeetingIdViewHeader
               meetingId={meetingId}
               meetingName={data.name}
               onEdit={()=>setUpdateMeetingDialogOpen(true)}
               onRemove={handleRemoveMeeting}
               />
              {isCancelled && <CancelledState/>}
              {isProcessing && (
                <Tabs defaultValue="overview">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="summary">Summary</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                        <ProcessingState/>
                    </TabsContent>
                    <TabsContent value="summary">
                        <div className="rounded-lg border p-4 space-y-3 text-sm">
                          <div className="flex flex-col gap-1 text-foreground">
                            <div><span className="font-medium">Participants:</span> You, {data.agent?.name ?? 'AI Agent'}</div>
                            <div><span className="font-medium">Date:</span> {new Date(data.endedAt ?? data.startedAt ?? data.createdAt).toLocaleString()}</div>
                          </div>
                          <div className="text-muted-foreground">Summary is being generated. Please check back shortly.</div>
                        </div>
                    </TabsContent>
                </Tabs>
              )}
              {isCompleted && (
                <Tabs defaultValue={(parsedSummary?.summaryText || data.summary) ? "summary" : "overview"}>
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="summary">Summary</TabsTrigger>
                        <TabsTrigger value="insights">Team Insights</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                        <div className="rounded-lg border p-4 text-sm">This meeting has been completed.</div>
                    </TabsContent>
                    <TabsContent value="summary">
                        <div className="rounded-lg border p-4 space-y-3">
                          <div className="flex flex-col gap-1 text-sm">
                            <div><span className="font-medium">Participants:</span> You, {data.agent?.name ?? 'AI Agent'}</div>
                            <div><span className="font-medium">Date:</span> {new Date(data.endedAt ?? data.startedAt ?? data.createdAt).toLocaleString()}</div>
                          </div>
                          {parsedSummary?.summaryText ? (
                            <div className="whitespace-pre-wrap text-sm">
                              {parsedSummary.summaryText}
                            </div>
                          ) : data.summary ? (
                            <div className="whitespace-pre-wrap text-sm">
                              {data.summary}
                            </div>
                          ) : (
                            <div className="text-sm">No summary available.</div>
                          )}
                        </div>
                    </TabsContent>
                    <TabsContent value="insights">
                        {insights ? (
                          <div className="flex flex-col gap-4">
                            {/* Source badge */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="rounded bg-muted px-2 py-1">
                                Source: {insights?.source === 'groq' ? 'Groq (LLM)' : insights?.source === 'heuristic' ? 'Heuristic' : insights?.source === 'hf-sst2' ? 'HF SST-2' : insights?.source === 'hybrid' ? 'Hybrid (HF + Groq)' : 'Unknown'}
                              </span>
                              <div className="ml-auto flex items-center gap-2">
                                <button onClick={handleCopySummary} className="text-xs underline">Copy Summary</button>
                                <button onClick={handleDownloadInsights} className="text-xs underline">Download JSON</button>
                              </div>
                            </div>
                            {/* Sentiment */}
                            <div className="rounded-lg border p-4">
                              <div className="font-medium mb-2">Sentiment Analysis</div>
                              <div className="text-sm">Overall sentiment: <span className="font-medium">{Math.round((insights.sentiment_analysis?.overall_score ?? 0) * 100)}%</span></div>
                              {Array.isArray(insights.sentiment_analysis?.notes) && insights.sentiment_analysis.notes.length > 0 && (
                                <ul className="list-disc pl-5 mt-2 text-sm text-muted-foreground">
                                  {insights.sentiment_analysis.notes.map((n: string, i: number) => (
                                    <li key={i}>{n}</li>
                                  ))}
                                </ul>
                              )}
                              {/* Per-participant sentiment if available */}
                              {insights.sentiment_analysis?.participants && (
                                <div className="mt-3">
                                  <div className="text-sm font-medium mb-1">Per‑participant</div>
                                  <div className="flex flex-col gap-2">
                                    {Object.entries(insights.sentiment_analysis.participants as Record<string, { avg_sentiment: number; confidence_level?: number }>).map(([name, s]) => (
                                      <div key={name} className="flex items-center gap-2 text-sm">
                                        <span className="w-32 truncate" title={name}>{name}</span>
                                        <div className="flex-1 h-2 bg-muted rounded">
                                          <div className="h-2 bg-primary rounded" style={{ width: `${Math.round((s.avg_sentiment ?? 0) * 100)}%` }} />
                                        </div>
                                        <span className="w-12 text-right">{Math.round((s.avg_sentiment ?? 0) * 100)}%</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Expertise */}
                            <div className="rounded-lg border p-4">
                              <div className="font-medium mb-2">Detected Expertise</div>
                              {expertise && Object.keys(expertise).length > 0 ? (
                                <div className="flex flex-col gap-3 text-sm">
                                  {Object.entries(expertise as Record<string, Record<string, number>>).map(([user, skills]) => (
                                    <div key={user}>
                                      <div className="font-medium">{user}</div>
                                      <div className="flex flex-col gap-2 mt-2">
                                        {Object.entries(skills).map(([skill, score]: [string, number]) => (
                                          <div key={skill} className="flex items-center gap-2">
                                            <span className="w-44 truncate" title={skill}>{skill}</span>
                                            <div className="flex-1 h-2 bg-muted rounded">
                                              <div className="h-2 bg-primary rounded" style={{ width: `${Math.round((score ?? 0) * 100)}%` }} />
                                            </div>
                                            <span className="w-12 text-right text-xs">{Math.round((score ?? 0) * 100)}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">No expertise detected.</div>
                              )}
                            </div>

                            {/* Role suggestions */}
                            <div className="rounded-lg border p-4">
                              <div className="font-medium mb-2">Role Suggestions</div>
                              {Array.isArray(insights.role_suggestions) && insights.role_suggestions.length > 0 ? (
                                <div className="flex flex-col gap-2 text-sm">
                                  {insights.role_suggestions.map((s: InsightsRoleSuggestion, i: number) => (
                                    <div key={i} className="flex flex-col gap-2 border rounded px-2 py-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="font-medium">{s.role}</div>
                                        <span className="rounded bg-muted px-2 py-1 text-xs">{s.user}</span>
                                      </div>
                                      {s.reasoning && (
                                        <div className="text-muted-foreground">{s.reasoning}</div>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 bg-muted rounded">
                                          <div className="h-2 bg-primary rounded" style={{ width: `${Math.round((s.confidence ?? 0) * 100)}%` }} />
                                        </div>
                                        <span className="w-14 text-right text-xs">{Math.round((s.confidence ?? 0) * 100)}%</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">No role suggestions available.</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border p-4 text-sm">Insights are unavailable for this meeting.</div>
                        )}
                    </TabsContent>
                </Tabs>
              )}
              {isActive && <ActiveState meetingId={meetingId}/>}
              {isUpcoming && (<UpcomingState
                    meetingId={meetingId}
                    onCancelMeeting={()=>{}}
                    isCancelling={false}
                />)}
          </div>
        </>
    )
};

export const MeetingIdViewLoading = () => {
        return (
            <LoadingState
            title="Loading Meetings"
            description="This may take a few seconds ..."/>
        )
}  

export const MeetingIdViewError=()=>{
    return (
        <ErrorState
            title="Error Loading Meetings"
            description="Something went wrong"
        />
    );
}