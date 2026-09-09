/** Inline all assets to produce a fully offline report. */
import { readFileSync } from 'node:fs';
export function generateReportHtml(results:unknown,repeated:unknown=null):string {
  const template=readFileSync(new URL('./report-template.html',import.meta.url),'utf8');
  const client=readFileSync(new URL('./report-client.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('./repeated-client.js',import.meta.url),'utf8');
  const data=JSON.stringify(results).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const repeatedData=JSON.stringify(repeated).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return template.replace('/*__RESULTS__*/',()=>`window.RESULTS=${data};window.REPEATED=${repeatedData};`).replace('/*__CLIENT__*/',()=>client);
}
