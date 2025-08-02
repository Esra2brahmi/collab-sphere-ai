"use client";

import { DataTable } from "@/components/data-table";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import {  useSuspenseQuery } from "@tanstack/react-query";
import { columns } from "../components/columns";
import { EmptyState } from "@/components/empty-state";
import { useMeetingsFilters } from "../../hooks/use-meetings-filters";
import { useRouter } from "next/navigation";
import { DataPagination } from "@/components/data-pagination";

export const MeetingsView = () => {
    const [filters,setFilters] = useMeetingsFilters();
    const trpc= useTRPC();
    const {data} = useSuspenseQuery(trpc.meetings.getMany.queryOptions({
        ...filters,
    }));
   
    const router= useRouter();
    
    return (
        <div className="flex-1 pb-4 px-4 md:px-8 flex flex-col gap-y-4">
            <DataTable data={data.items} columns={columns} onRowClick={(row) => router.push(`/meetings/${row.id}`)}/>
            <DataPagination
               page={filters.page}
               totalPages={data.totalPages}
               onPageChange={(page)=>setFilters({page})}
            />
            {data.items.length === 0 && (
                <EmptyState
                    title="create your first meeting"
                    description="schedule a meeting to collaborate with your agents and discuss your projects. You can invite multiple agents to join the meeting and share their knowledge."
                />
            )}
        </div>
    );
};

export const MeetingsViewLoading = () => {
        return (
            <LoadingState
            title="Loading Meetings"
            description="This may take a few seconds ..."/>
        )
}  

export const MeetingsViewError=()=>{
    return (
        <ErrorState
            title="Error Loading Meetings"
            description="Something went wrong"
        />
    );
}