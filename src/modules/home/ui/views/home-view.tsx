"use client";

import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoIcon, UsersIcon, CalendarIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

export const HomeView = () => {
    const trpc = useTRPC();
    const { data: activeMeetings } = useSuspenseQuery(
        trpc.meetings.getActiveMeetings.queryOptions({
            page: 1,
            pageSize: 5, // Show up to 5 active meetings
        })
    );

    return (
        <div className="flex-1 pb-4 px-4 md:px-8 flex flex-col gap-y-6">
            {/* Welcome Section */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
                <h1 className="text-2xl font-bold mb-2">Welcome to Collab Sphere AI</h1>
                <p className="text-blue-100">
                    Create meetings with AI assistants and collaborate with your team in real-time video calls.
                </p>
            </div>

            {/* Active Meetings Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <VideoIcon className="w-5 h-5" />
                        Available Meetings You Can Join
                    </h2>
                    <Button asChild>
                        <Link href="/meetings">
                            View All Meetings
                        </Link>
                    </Button>
                </div>

                {activeMeetings.items.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {activeMeetings.items.map((meeting) => (
                            <Card key={meeting.id} className="hover:shadow-lg transition-shadow">
                                <CardHeader>
                                    <CardTitle className="text-lg">{meeting.name}</CardTitle>
                                    <CardDescription>
                                        <div className="flex items-center gap-2 text-sm">
                                            <UsersIcon className="w-4 h-4" />
                                            {meeting.agent.name} • AI Assistant
                                        </div>
                                        <div className="flex items-center gap-2 text-sm mt-1">
                                            <CalendarIcon className="w-4 h-4" />
                                            Created {new Date(meeting.createdAt).toLocaleDateString()}
                                        </div>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Button asChild className="w-full">
                                        <Link href={`/call/${meeting.id}`}>
                                            <VideoIcon className="w-4 h-4 mr-2" />
                                            Join Meeting
                                        </Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        title="No Active Meetings"
                        description="There are no active meetings to join right now. Create a new meeting to get started!"
                        image="/empty-meetings.svg"
                    />
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Create New Meeting</CardTitle>
                        <CardDescription>
                            Start a new meeting with an AI assistant
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild className="w-full">
                            <Link href="/meetings/new">
                                <VideoIcon className="w-4 h-4 mr-2" />
                                Create Meeting
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Manage Agents</CardTitle>
                        <CardDescription>
                            Create and configure AI assistants
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/agents">
                                <UsersIcon className="w-4 h-4 mr-2" />
                                View Agents
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

