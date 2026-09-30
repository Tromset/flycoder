// FlyCoder adapter for the upstream Ollama-Code Ink interface.
import type { Config, Message, ToolCall, ToolResult, PermissionRequest } from './types';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Runner } = require('../../../core/runner.cjs');
const { configFor } = require('../../../core/config.cjs');
export interface AgentEvents {
 onThinking?(delta:string):void; onContent?(delta:string):void;
 onToolStart?(call:ToolCall):void; onToolResult?(call:ToolCall,res:ToolResult):void;
 onUsage?(u:{used:number;max:number;pct:number}):void;
 onAskPermission?(req:PermissionRequest):Promise<{decision:'allow'|'deny';always?:boolean}>;
}
export interface Agent { send(text:string,images?:string[]):Promise<void>; abort():void; messages:Message[]; }
export function createAgent(deps:{config:Config;events:AgentEvents;[key:string]:unknown}):Agent {
 let runner:any; let messages:Message[]=[];
 return { get messages(){return messages;}, abort(){runner?.abort();}, async send(text,images){
  if(images?.length) throw new Error('FlyCoder beta accepts source text; image attachments are not implemented.');
  const c=deps.config; const config=configFor(process.cwd(),{...JSON.parse(process.env.FLYCODER_SESSION_CONFIG||'{}'),model:c.model,host:c.host,numCtx:c.numCtx,maxTurns:c.maxTurns});
  runner=new Runner(config,{onEvent:(e:any)=>{
   if(e.type==='message') deps.events.onContent?.(`[${e.role}] ${e.content}\n`);
   if(e.type==='tool_start') deps.events.onToolStart?.(e.call);
   if(e.type==='tool_result') deps.events.onToolResult?.(e.call,e.result);
   if(e.type==='metrics' && e.promptTokens!=null) deps.events.onUsage?.({used:e.promptTokens,max:c.numCtx,pct:Math.round(e.promptTokens/c.numCtx*100)});
  }});
  const run=await runner.start(text,{mode:c.mode==='vision'?'plan':c.mode});
  const result=`Run ${run.id}: ${run.status}. Reward: ${run.reward??'unverified'}.\n${run.error||''}\nReview: flycoder ui — apply: flycoder apply ${run.id}`;
  deps.events.onContent?.('\n'+result+'\n');
  messages.push({role:'user',content:text},{role:'assistant',content:result});
 }};
}
