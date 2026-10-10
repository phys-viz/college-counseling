import type {Report} from './report-types';
export type SeedPayload={id:string;gzip:string};
/** Decode only missing records within the request that will insert them. */
export async function decodeSeed(entry:SeedPayload):Promise<Report>{
 const bytes=Uint8Array.from(atob(entry.gzip.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 const record=JSON.parse(await new Response(stream).text()) as Report;
 if(`${record.school_id}:${record.year}`!==entry.id)throw new Error('Seed identity mismatch');
 return record;
}
