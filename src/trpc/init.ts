import { auth } from '@/lib/auth';
import { initTRPC, TRPCError } from '@trpc/server';
import next from 'next';
import { headers } from 'next/headers';
import { cache } from 'react';

interface TRPCContext {
  userId: string | null;
  session: any | null;
}

export const createTRPCContext = cache(async (): Promise<TRPCContext> => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return { 
      userId: session?.user?.id || null,
      session: session || null
    };
  } catch (error) {
    // During SSR, if we can't get the session, return null
    return { 
      userId: null,
      session: null
    };
  }
});

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<TRPCContext>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  // transformer: superjson,
});

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

export const protectedProcedure=baseProcedure.use(async ({ctx,next})=>{
  if(!ctx.session){
    throw new TRPCError({code:"UNAUTHORIZED",message:"Unauthorized"});
  }
  return next({ctx:{...ctx,auth:ctx.session}});
});