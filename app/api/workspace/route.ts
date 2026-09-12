import { context, readWorkspace, mutate } from '@/lib/store';
import { sameOrigin } from '@/lib/api-safety';
import { AppError } from '@/lib/validation';
export const dynamic='force-dynamic';
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){if(error instanceof AppError)return response({error:error.message},error.status);console.error('Workspace operation failed',error instanceof Error?error.message:'Unknown error');return response({error:'The workspace could not be saved or loaded. Please try again.'},500)}
export async function GET(){try{return response(await readWorkspace(await context()))}catch(e){return failure(e)}}
export async function POST(request:Request){try{if(!/^Bearer\s+studio_/.test(request.headers.get('authorization')||''))sameOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('JSON is required.',415);if(Number(request.headers.get('content-length')||0)>100000)throw new AppError('Request too large.',413);const raw=await request.text();if(raw.length>100000)throw new AppError('Request too large.',413);let input;try{input=JSON.parse(raw)}catch{throw new AppError('Invalid JSON.')}if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('An action object is required.');const c=await context();await mutate(c,input);return response(await readWorkspace(c))}catch(e){return failure(e)}}
