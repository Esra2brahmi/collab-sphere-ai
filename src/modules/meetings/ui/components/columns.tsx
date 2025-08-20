"use client"

import { ColumnDef } from "@tanstack/react-table"
import { useEffect, useState } from "react"
import { GeneratedAvatar } from "@/components/generated-avatar"
import { CircleCheckIcon, CircleXIcon, ClockArrowUpIcon, ClockFadingIcon, CornerDownRightIcon, CornerRightDownIcon, LoaderIcon, VideoIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { MeetingGetMany } from "../../types"
import { format } from "util"
import { cn } from "@/lib/utils"
import humanizeDuration from "humanize-duration"


function formatDuration(seconds:number){
  return humanizeDuration(seconds * 1000, {
    largest:1,
    round:true,
    units: ["h", "m", "s"],
  });
};

function LiveDuration({ start }: { start: Date }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - start.getTime()) / 1000));
  return <>{formatDuration(seconds)}</>;
}

const statusIconMap = {
  upcoming: ClockArrowUpIcon,
  active:LoaderIcon,
  completed: CircleCheckIcon,
  processing:LoaderIcon,
  cancelled: CircleXIcon,
};

const statusColorMap = {
  upcoming: "bg-yellow-500 text-yellow-800 border-yellow-800/5",
  active: "bg-blue-500/20 text-blue-800 border-blue-800/5",
  completed: "bg-emerald-500/20 text-emerald-800 border-emerald-800/5 ",
  processing: "bg-gray-300/20 text-gray-800 border-gray-800/5",
  cancelled: "bg-rose-300/20 text-rose-800 border-rose-800/5",
}

type Meeting = MeetingGetMany[number];

export const columns: ColumnDef<MeetingGetMany[number] >[]= [
  {
    accessorKey: "name",
    header: "Meeting Name",
    cell : ({ row }) => (
      <div className="flex flex-col gap-y-1">
        <span className="font-semibold capitalize">{row.original.name}</span>
          <div className="flex items-center gap-x-2">
            <div className="flex items-center gap-x-1">
            <CornerDownRightIcon className="size-3 text-muted-foreground"/>
            <span className="text-sm text-muted-foreground max-w-[200px] truncate capitalize">
              {row.original.name}
            </span>
          </div>
          <GeneratedAvatar 
            variant="botttsNeutral"
            seed={row.original.agent.name}
            className="size-4"
          />
          <span className="text-sm text-muted-foreground">
            {row.original.startedAt ? format(row.original.startedAt,"MMM d"):""}
          </span>

          </div>
        </div>
    )
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const Icon= statusIconMap[row.original.status as keyof typeof statusIconMap];

      return (
        <Badge
          variant="outline"
          className={cn(
            "capitalize [&>svg]:size-4 text-muted-foreground",
            statusColorMap[row.original.status as keyof typeof statusColorMap]
          )}
        >
          <Icon
            className={cn(
              row.original.status==="processing" && "animate-spin"
            )}
          />
          {row.original.status}
        </Badge>
      )
    },
  },
  {
    accessorKey:"duration",
    header: "duration",
    cell:({row}) => {
      const startedAt = row.original.startedAt ? new Date(row.original.startedAt) : null;
      const endedAt = row.original.endedAt ? new Date(row.original.endedAt) : null;
      let seconds: number | null = null;

      if (row.original.status === "active" && startedAt) {
        // Live ticking duration
        return (
          <Badge variant="outline" className="capitalize [&>svg]:size-4 flex items-center gap-x-2">
            <ClockFadingIcon className="text-blue-700"/>
            <LiveDuration start={startedAt} />
          </Badge>
        );
      }

      if (row.original.duration != null) {
        seconds = row.original.duration;
      } else if (startedAt && endedAt) {
        seconds = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
      }

      return (
        <Badge variant="outline" className="capitalize [&>svg]:size-4 flex items-center gap-x-2">
          <ClockFadingIcon className="text-blue-700"/>
          {seconds != null ? formatDuration(seconds) : "—"}
        </Badge>
      );
    }
  
  }

]
