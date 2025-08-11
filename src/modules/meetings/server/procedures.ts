import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {db} from "@/db";
import {agents, meetings } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { and, count, desc,eq, getTableColumns, ilike, sql } from "drizzle-orm";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/constants";
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas";
import { MeetingStatus } from "../types";
import { streamVideo } from "@/lib/stream-video";
import { generatedAvatarUri } from "@/lib/avatar";

export const meetingsRouter=createTRPCRouter({
    generateToken: protectedProcedure.mutation(async({ctx})=> {
        await streamVideo.upsertUsers([
            {
                id:ctx.auth.user.id,
                name:ctx.auth.user.name,
                role:"admin",
                image:
                   ctx.auth.user.image ??
                   generatedAvatarUri({seed:ctx.auth.user.id,variant:"initials"}),
            },
        ]);
        const expirationTime=Math.floor(Date.now()/1000)+3600;
        const issuedAt=Math.floor(Date.now()/1000)-60;
        const token=streamVideo.generateUserToken({user_id:ctx.auth.user.id,exp:expirationTime,validity_in_seconds:issuedAt});
        return token;
    }),
    remove: protectedProcedure
        .input(z.object({id:z.string()}))
        .mutation(async({input,ctx})=>{
            const [removedMeeting]=await db
            .delete(meetings)
            .where(
                and(
                    eq(meetings.id,input.id),
                    eq(meetings.userId, ctx.auth.user.id),
                ),
            )
            .returning();
            if(!removedMeeting){
                throw new TRPCError({
                    code:"NOT_FOUND",
                    message:"Agent not found",
                });
            }
            return removedMeeting;
        }),
    update: protectedProcedure
        .input(meetingsUpdateSchema.extend({ id: z.string() }))
        .mutation(async({input,ctx})=>{
            const [updatedMeeting]=await db
            .update(meetings)
            .set(input)
            .where(
                and(
                    eq(meetings.id,input.id),
                    eq(meetings.userId, ctx.auth.user.id),
                ),
            )
            .returning();
            if(!updatedMeeting){
                throw new TRPCError({
                    code:"NOT_FOUND",
                    message:"Agent not found",
                });
            }
            return updatedMeeting;
        }),
    create: protectedProcedure.input(meetingsInsertSchema).mutation(async({input,ctx})=>{
            console.log('[Meeting Creation] Starting creation with input:', input);
            console.log('[Meeting Creation] User ID:', ctx.auth.user.id);

            const [createdMeeting]=await db
            .insert(meetings)
            .values({
                ...input,
                userId:ctx.auth.user.id,
                status: "active", // Set to active so it appears on home page immediately
            })
            .returning();

            console.log('[Meeting Creation] Created meeting:', createdMeeting);

            const call = streamVideo.video.call("default",createdMeeting.id);
            await call.create({
                data:{
                    created_by_id:ctx.auth.user.id,
                    custom:{
                        meetingId: createdMeeting.id,
                        meetingName:createdMeeting.name
                    },
                    settings_override:{
                        transcription: {
                            language:"en",
                            mode:"auto-on",
                            closed_caption_mode:"auto-on",
                        },
                        recording:{
                            mode:"auto-on",
                            quality:"1080p",
                        },
                        // Multi-participant settings
                        audio: {
                            mic_default_on: false, // Mics off by default for new participants
                            speaker_default_on: true,
                            default_device: "speaker", // Default audio output device
                        },
                        video: {
                            camera_default_on: false, // Cameras off by default
                            target_resolution: {
                                width: 640,  // Minimum 240, using 640 for better quality
                                height: 480, // Minimum 240, using 480 for better quality
                                bitrate: 500000, // 500 kbps bitrate
                            },
                        },
                    }
                },
            })

            console.log('[Meeting Creation] Stream call created successfully');

            const [existingAgent]=await db 
               .select()
               .from(agents)
               .where(eq(agents.id,createdMeeting.agentId));
            
            console.log('[Meeting Creation] Agent lookup result:', existingAgent);
            console.log('[Meeting Creation] Agent ID from meeting:', createdMeeting.agentId);
            
            if(!existingAgent){
                console.log('[Meeting Creation] ERROR: Agent not found!');
                throw new TRPCError({
                    code:"NOT_FOUND",
                    message:"Agent not found",
                });
            }

            await streamVideo.upsertUsers([
                {
                    id: existingAgent.id,
                    name:existingAgent.name,
                    role:"user",
                    image: generatedAvatarUri({
                        seed:existingAgent.name,
                        variant:"botttsNeutral",
                    }),
                }
            ]);

            console.log('[Meeting Creation] Meeting creation completed successfully');
            return createdMeeting;
        }),
    getOne: protectedProcedure.input(z.object({id:z.string()})).query(async({input,ctx})=>{
            console.log('[Meeting GetOne] Looking for meeting ID:', input.id);
            console.log('[Meeting GetOne] User ID:', ctx.auth.user.id);

            // First, let's check if the meeting exists without any joins
            const [rawMeeting] = await db
                .select()
                .from(meetings)
                .where(eq(meetings.id, input.id));
            
            console.log('[Meeting GetOne] Raw meeting (no joins):', rawMeeting);

            if (!rawMeeting) {
                console.log('[Meeting GetOne] Meeting does not exist at all');
                throw new TRPCError({
                    code:"NOT_FOUND",
                    message:"Meeting not found",
                });
            }

            // Now let's check if the agent exists
            const [rawAgent] = await db
                .select()
                .from(agents)
                .where(eq(agents.id, rawMeeting.agentId));
            
            console.log('[Meeting GetOne] Raw agent:', rawAgent);
            console.log('[Meeting GetOne] Agent ID from meeting:', rawMeeting.agentId);

            const [existingMeeting]=await db
           .select({
            ...getTableColumns(meetings),
            agent:agents,
            duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
           })
           .from(meetings)
           .leftJoin(agents,eq(meetings.agentId,agents.id))
           .where(
            eq(meetings.id,input.id)
        );

            console.log('[Meeting GetOne] Query result:', existingMeeting);

            // Now check access control
            if (existingMeeting) {
                const canAccess = existingMeeting.userId === ctx.auth.user.id || 
                                 existingMeeting.status === MeetingStatus.Active || 
                                 existingMeeting.status === MeetingStatus.Upcoming;
                
                console.log('[Meeting GetOne] Access check:', {
                    isOwner: existingMeeting.userId === ctx.auth.user.id,
                    isActive: existingMeeting.status === MeetingStatus.Active,
                    isUpcoming: existingMeeting.status === MeetingStatus.Upcoming,
                    canAccess
                });
                
                if (!canAccess) {
                    console.log('[Meeting GetOne] Access denied');
                    throw new TRPCError({
                        code:"FORBIDDEN",
                        message:"Access denied to this meeting",
                    });
                }
            }

        if(!existingMeeting){
            console.log('[Meeting GetOne] Meeting not found - checking if it exists at all...');
            
            // Let's check if the meeting exists at all (without restrictions)
            const [anyMeeting] = await db
                .select()
                .from(meetings)
                .where(eq(meetings.id, input.id));
            
            console.log('[Meeting GetOne] Meeting exists in DB:', !!anyMeeting);
            if (anyMeeting) {
                console.log('[Meeting GetOne] Meeting details:', {
                    id: anyMeeting.id,
                    status: anyMeeting.status,
                    userId: anyMeeting.userId,
                    currentUserId: ctx.auth.user.id
                });
            }

            throw new TRPCError({
                code:"NOT_FOUND",
                message:"Meeting not found",
            });
        }

            console.log('[Meeting GetOne] Meeting found successfully');
        return existingMeeting;
    }),
    getMany: protectedProcedure
        .input(z.object({
            page: z.number().default(DEFAULT_PAGE),
            pageSize: z.number().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
            search: z.string().nullish(),
            agentId: z.string().nullish(),
            status: z .enum([MeetingStatus.Upcoming, MeetingStatus.Active, MeetingStatus.Completed, MeetingStatus.Processing, MeetingStatus.Cancelled]).nullish(),
        }))
        .query(async({ctx,input})=>{
        const {search ,page, pageSize,status,agentId}=input;
        const data=await db
           .select({
            ...getTableColumns(meetings),
            agent : agents,
            duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
           })
           .from(meetings)
           .innerJoin(agents, eq(meetings.agentId, agents.id))
           .where(
            and(
                eq(meetings.userId, ctx.auth.user.id),
                search ? ilike(meetings.name, `%${search}%`) : undefined, 
                status ? eq(meetings.status, status) : undefined,
                agentId ? eq(meetings.agentId, agentId) : undefined, 
            )
           )
           .orderBy(desc(meetings.createdAt),desc(meetings.id))
           .limit(pageSize)
           .offset((page-1)*pageSize)

           const [total]= await db
           .select({count:count()})
           .from(meetings)
           .where(
            and(
                eq(meetings.userId, ctx.auth.user.id),
                search ? ilike(meetings.name, `%${search}%`) : undefined,
                status ? eq(meetings.status, status) : undefined,
                agentId ? eq(meetings.agentId, agentId) : undefined,
                
            )
           );
           const totalPages=Math.ceil(total.count/pageSize);

           return {
            items: data,
            total: total.count,
            totalPages,
           };

      
    }),
    // Get all active meetings that any user can join (for multi-participant support)
    getActiveMeetings: protectedProcedure
        .input(z.object({
            page: z.number().default(DEFAULT_PAGE),
            pageSize: z.number().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
            search: z.string().nullish(),
        }))
        .query(async({ctx,input})=>{
        const {search ,page, pageSize}=input;
        const data=await db
           .select({
            ...getTableColumns(meetings),
            agent : agents,
            duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
           })
           .from(meetings)
           .innerJoin(agents, eq(meetings.agentId, agents.id))
           .where(
            and(
                // Show active and upcoming meetings that anyone can join
                (eq(meetings.status, MeetingStatus.Active) || eq(meetings.status, MeetingStatus.Upcoming)),
                search ? ilike(meetings.name, `%${search}%`) : undefined, 
            )
           )
           .orderBy(desc(meetings.createdAt),desc(meetings.id))
           .limit(pageSize)
           .offset((page-1)*pageSize)

           const [total]= await db
           .select({count:count()})
           .from(meetings)
           .where(
            and(
                (eq(meetings.status, MeetingStatus.Active) || eq(meetings.status, MeetingStatus.Upcoming)),
                search ? ilike(meetings.name, `%${search}%`) : undefined,
            )
           );
           const totalPages=Math.ceil(total.count/pageSize);

           return {
            items: data,
            total: total.count,
            totalPages,
           };
    }),
});