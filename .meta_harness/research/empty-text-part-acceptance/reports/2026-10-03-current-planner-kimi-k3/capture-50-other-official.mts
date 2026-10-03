import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const sharp = createRequire(new URL('../../packages/model/pi-ai-transport/package.json', import.meta.url))('sharp')
import { planRequest } from './capture-50-baseline-plan.mts'
import { openaiDefinitions } from '../../packages/model/pi-ai-transport/src/official-models/openai.ts'
import { createOpenAiInputMeter } from '../../packages/model/pi-ai-transport/src/input-meters/openai.ts'
import { createOfficialProfileContent } from '../../packages/model/pi-ai-transport/src/configuration.ts'
import { moonshotModels, moonshotRequest, visible } from '../../packages/model/pi-ai-transport/tests/moonshot-support.ts'
import { at, judgedMessage } from '../../packages/model/pi-ai-transport/tests/support.ts'
import { testImagePreparerFor } from '../../packages/model/pi-ai-transport/tests/image-transport-support.ts'
const definition = openaiDefinitions[0]!
const provider = Object.keys(definition.routes)[0]!
const profile = createOfficialProfileContent(definition,{providers:[provider],allowFallback:false,configuration:{revision:'1',values:{cache:{mode:'automatic'}}}})
assert.ok('ok' in profile)
const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#d64541'}}).png().toBuffer()
const base=moonshotRequest(moonshotModels[0])
const request={...base,routeName:definition.modelId,provider,messages:[judgedMessage({type:'user',id:'user',createdAt:at,blocks:[{id:'image',kind:'image',mediaType:'image/png',data:{inline:bytes.toString('base64')},visibility:visible},{id:'text',kind:'text',text:'',visibility:visible}]})],snapshot:{...base.snapshot,adaptation:profile.ok.adaptation,providers:profile.ok.providers,allowFallback:profile.ok.allowFallback,inputModalities:profile.ok.inputModalities,outputModalities:profile.ok.outputModalities,maxInputTokens:profile.ok.maxInputTokens,maxOutputTokens:profile.ok.maxOutputTokens,inputConstraints:profile.ok.inputConstraints,upstreamInputLimits:profile.ok.upstreamInputLimits}}
const result=await planRequest(request,[definition],createOpenAiInputMeter(definition),{signal:new AbortController().signal},testImagePreparerFor(planRequest))
assert.ok('planned' in result,JSON.stringify(result))
const original=execFileSync('git',['show','75da02d205980c97bb3c279741abb356d70fdc00:packages/model/pi-ai-transport/src/plan.ts'])
const baseline={scope:'Actual baseline planner; import paths relocated only. Other-official definitions, meter and image preparation inputs unchanged from baseline. No network or upstream observation.',baseline:'75da02d205980c97bb3c279741abb356d70fdc00',originalPlanSha256:createHash('sha256').update(original).digest('hex'),relocatedPlanSha256:createHash('sha256').update(readFileSync('tmp/test-tiers-mutation/capture-50-baseline-plan.mts')).digest('hex'),modelId:definition.modelId,provider,serialized:result.planned.serialized,networkRequests:0}
writeFileSync('packages/model/pi-ai-transport/tests/fixtures/moonshot/other-official-before-empty-text.json',JSON.stringify(baseline,null,2)+'\n')
process.stdout.write(JSON.stringify({result:'PASS',modelId:definition.modelId,networkRequests:0})+'\n')
