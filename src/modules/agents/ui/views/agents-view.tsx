"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { DataTable } from "@/components/data-table";
import { columns} from "../components/columns";
import { useAgentsFilters } from "../../hooks/use-agents-filters";
import { DataPagination } from "../components/data-pagination";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/empty-state";


export const AgentsView = () => {
    const router = useRouter();
    const [filters,setFilters] = useAgentsFilters();
    const trpc=useTRPC();
    const { data} = useSuspenseQuery(trpc.agents.getMany.queryOptions({
        ...filters,
    }));

    

    return (
    <div className="flex-1 pb-4 px-4 md:px-8 flex flex-col gap-y-4">
      <DataTable data={data.items} columns={columns} onRowClick={(row) => router.push(`/agents/${row.id}`)}/>
      <DataPagination 
        page = {filters.page}
        totalPages={data.totalPages}
        onPageChange = { (page) => setFilters({page})}
       />
       {data.items.length === 0 && (
        <EmptyState
            title="create your first agent"
            description="Create an agent to join your meetings and collaborate with you.Each agent can have its own set of skills and knowledge and will follow your instructions."
        />
       )}
    </div>
    );

};

export const AgentsViewLoading = () => {
        return (
            <LoadingState
            title="Loading Agents"
            description="This may take a few seconds ..."/>
        )
}  

export const AgentsViewError=()=>{
    return (
        <ErrorState
            title="Error Loading Agents"
            description="Something went wrong"
        />
    );
}
function useRputer() {
    throw new Error("Function not implemented.");
}

