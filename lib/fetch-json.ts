/** Bound a data read so a stalled request reaches the existing Retry state. */
export async function fetchJSON<T=unknown>(url:string,signal?:AbortSignal,timeoutMs=15000):Promise<T>{
 const timeout=new AbortController();
 const timer=setTimeout(()=>timeout.abort(),timeoutMs);
 try{
  const response=await fetch(url,{signal:signal?AbortSignal.any([signal,timeout.signal]):timeout.signal});
  const data=await response.json();
  if(!response.ok){
   const error=data&&typeof data==='object'&&'error' in data?data.error:undefined;
   throw new Error(typeof error==='string'?error:'Unable to load reports. Please retry.');
  }
  return data as T;
 }catch(error){
  if(timeout.signal.aborted&&!signal?.aborted)throw new Error('The library took too long to respond. Please retry.');
  throw error;
 }finally{clearTimeout(timer);}
}
