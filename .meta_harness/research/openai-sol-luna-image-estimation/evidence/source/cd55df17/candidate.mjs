import { createRequire } from 'node:module'
import { defineInputMeter } from '../../../../packages/model/pi-ai-transport/dist/index.js'
import { writeJsonLossless } from '../../../../packages/core/content-blocks/dist/index.js'
// Root explicitly authorized this private, source/dist-bound research helper use.
// This internal helper is NOT a product public API or an actual Sol/Luna formula.
import { imageTokens } from '../../../../packages/model/pi-ai-transport/dist/input-meters/openai-images.js'
import { images } from './fixtures.mjs'
const require = createRequire(new URL('../../../../packages/model/pi-ai-transport/package.json', import.meta.url))
const { getEncoding } = require('js-tiktoken')
const encoder = getEncoding('o200k_base')
const urls = new Set(Object.values(images).map(x => x.url))
const keys = (value, allowed) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key))
export function createPilotMeter(definition) {
 return defineInputMeter({
  modelId: definition.modelId,
  provider:'openai',
  definitionRevision:definition.revision,
  implementation:definition.implementation,
  algorithmRevision:'sol-luna-image-range-json-patches32-multiplier1.2/2',
  tokenizerRevision:'js-tiktoken-1.0.21-o200k-base-research-surrogate/1',
  ...(definition.modelId.endsWith('-pro') ? {transformRevision:'openrouter-input-transform/pro-scope-1'} : {}),
  evidence:'Unadopted finite research hypothesis: published OpenAI 32px/1.2 family proxy on only frozen 64x64/256x32 Pro pair and 65x65/1024x1024/2049x2903 base PNGs, original/auto detail. Official Sol/Luna docs confirm image input but do not publish this preprocessing/token rule. Private framing and tokenizer identity unverified; actual holdout required; no error bound. Pro billing scope remains unknown.',
  measureFull({body,serialized}) {
   if(writeJsonLossless(body)!==serialized || body.model!==definition.modelId ||
      !keys(body,['model','provider','messages','max_tokens','reasoning','store','stream']) ||
      writeJsonLossless(body.provider)!==writeJsonLossless({order:['openai'],allow_fallbacks:false,require_parameters:true}) ||
      body.stream!==true || body.store!==false || writeJsonLossless(body.max_tokens)!=='512' ||
      writeJsonLossless(body.reasoning)!==writeJsonLossless({effort:'low'}) ||
      !Array.isArray(body.messages) || body.messages.length!==1) return {kind:'unavailable'}
   const message=body.messages[0]
   if(!keys(message,['role','content']) || message.role!=='user' || !Array.isArray(message.content) || message.content.length<1 || message.content.length>3) return {kind:'unavailable'}
   const [text,...parts]=message.content
   if(writeJsonLossless(text)!==writeJsonLossless({type:'text',text:'Reply exactly OK.'})) return {kind:'unavailable'}
   let visual=0
   const projected=[text]
   for(const part of parts){
    if(!keys(part,['type','image_url']) || part.type!=='image_url' || !keys(part.image_url,['url']) || !urls.has(part.image_url.url)) return {kind:'unavailable'}
    const tokens=imageTokens(part,'astra-patch')
    if(tokens===undefined) return {kind:'unavailable'}
    visual+=tokens
    projected.push({...part,image_url:{url:'[image]'}})
   }
   const copy={...body,messages:[{...message,content:projected}]}
   return {kind:'estimated',tokens:encoder.encode(writeJsonLossless(copy)).length+visual}
  },
 })
}
