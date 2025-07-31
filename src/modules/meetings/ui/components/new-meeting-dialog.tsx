'use client';
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { MeetingForm } from "./meetings-form";
import router from "next/router";




interface NewMeetingDialogProps {
    open:boolean;
    onOpenChange: (open:boolean) => void;
};

export const NewMeetingDialog=({
    open,
    onOpenChange,
}:NewMeetingDialogProps) => {
   return (
    <ResponsiveDialog
     title="New Meeting"
      description="Create a new Meeting"
      open={open}
      onOpenChange={onOpenChange}
    >
        <MeetingForm
            onSuccess={(id)=>{
                onOpenChange(false);
                router.push(`/meetings/${id}`);
            }}
            onCancel= {()=> onOpenChange}
        />
    </ResponsiveDialog> 
   )
}