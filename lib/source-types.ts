// format is omitted for PDFs; 'xlsx' marks an Office Open XML CDS workbook.
export type SourceDocument={url:string;title:string;year:number|null;format?:'xlsx'};
export type SourceDiscovery={index_url:string;title:string;documents:SourceDocument[];other_documents?:SourceDocument[];notes:string[]};
export function sourceYear(text:string):number|null {
  const match=text.match(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/i);
  if(match)return Number(match[1]);
  const compact=text.match(/(?:cds|common.?data.?set)[_-]?((?:19|20)\d{2})/i);
  return compact?Number(compact[1]):null;
}
