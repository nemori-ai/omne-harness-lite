import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createQwenInputMeter } from '../../../../../../packages/model/pi-ai-transport/dist/input-meters/qwen.js';
import { qwenDefinitions } from '../../../../../../packages/model/pi-ai-transport/dist/official-models/qwen.js';
import { readJsonStrict, writeJsonLossless } from '../../../../../../packages/core/content-blocks/dist/index.js';
const base = new URL('./fixtures/', import.meta.url);
const rows=[];
for (const name of ['max0902','flash','max37','plus37','flash37']) {
 const golden=JSON.parse(readFileSync(new URL(`${name}-route-golden.json`,base),'utf8'));
 const id=golden.modelId??golden.requestedModel;
 const meter=createQwenInputMeter(qwenDefinitions.find(d=>d.modelId===id));
 for (const item of golden.rows) {
  const path=`${name==='max0902'?'probe-six':name+'-route'}/${item.file}`;
  const bytes=readFileSync(new URL(path,base));
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(sha !== (item.fileSha256??item.sha256))throw Error(`fixture hash mismatch: ${path}`);
  const parsed=readJsonStrict(bytes.toString('utf8'));
  if(!('ok' in parsed))throw Error('parse');
  const measured=meter.measureFull({body:parsed.ok,serialized:writeJsonLossless(parsed.ok)});
  const actual=item.observedInputTokens??item.observedPromptTokens;
  rows.push({modelId:id,path,sha256:sha,algorithmRevision:meter.algorithmRevision,estimate:measured,oldActual:actual,residual:measured.kind==='estimated'?Number(measured.tokens)-actual:null});
 }
}
writeFileSync(new URL('recomputed-residuals.json',import.meta.url),JSON.stringify({scope:'Offline reevaluation of frozen old single-user inputs, not new-binding online certification or multi-turn error bound',rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(x=>({modelId:x.modelId,residual:x.residual})),null,2));
