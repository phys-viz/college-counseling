import {copyFileSync,mkdirSync} from 'node:fs';
const directory=new URL('../public/',import.meta.url);mkdirSync(directory,{recursive:true});
copyFileSync(new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url),new URL('pdf.worker.min.mjs',directory));
