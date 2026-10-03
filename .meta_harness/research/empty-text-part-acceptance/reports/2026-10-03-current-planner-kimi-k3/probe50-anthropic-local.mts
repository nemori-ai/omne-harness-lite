// Current public planner only. No credential, HTTP or provider-acceptance claim.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { judgeMessage } from '../../packages/core/messages/dist/index.js'
import { writeJsonLossless } from '../../packages/core/content-blocks/dist/index.js'
import { parseOpaqueIdentifier, unwrap } from '../../packages/core/identity-values/dist/index.js'
import { officialCatalog, createOfficialCatalogProfile, createPiAiTransport, createSharpImageCodec, modelImageBalancedV1 } from '../../packages/model/pi-ai-transport/dist/index.js'
import { openRouterCredentialRedactionConfig } from '../../packages/model/model-request-runtime/dist/index.js'
const sharp=createRequire(new URL('../../packages/model/pi-ai-transport/package.json',import.meta.url))('sharp')
const entry=officialCatalog.find(e=>e.definition.modelId==='anthropic/claude-sonnet-5')!
const profile=createOfficialCatalogProfile(entry,'anthropic-local-probe-1')
assert.ok('ok' in profile)
const transport=createPiAiTransport({definitions:[entry.definition],inputMeters:[entry.createInputMeter(entry.definition)],imagePreparation:{policy:modelImageBalancedV1,codec:createSharpImageCodec(sharp)},policy:{maxConnections:1,idleConnectionTimeoutMs:1000,connectTimeoutMs:1000,maxErrorBodyBytes:4096,maxSseEventBytes:16384,credentialRedaction:openRouterCredentialRedactionConfig}})
const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#d64541'}}).png().toBuffer()
const visibility={toHuman:true,toModel:true}
const image={id:'image',kind:'image',mediaType:'image/png',data:{inline:bytes.toString('base64')},visibility}
const empty={id:'empty',kind:'text',text:'',visibility}
const cases=[]
try {
 for(const [shape,blocks] of [['image-empty',[image,empty]],['empty-image',[empty,image]],['pure-image',[image]]] as const){
  const message=judgeMessage({type:'user',id:'anthropic-image-user',createdAt:'2026-10-03T00:00:00Z',blocks}); assert.ok('ok' in message)
  const request={target:{kind:'model_call' as const,callId:unwrap(parseOpaqueIdentifier('anthropic-local','ModelCallId')),dispatch:1},routeName:entry.definition.modelId,provider:entry.provider,parameters:{maxOutputTokens:64},tools:[],messages:[message.ok],tokenMargin:{multiplier:1.2,reserveTokens:32},calibration:{kind:'none' as const,reason:'no_observation' as const},outputHistory:[],snapshot:{adaptation:profile.ok.adaptation,providers:profile.ok.providers,allowFallback:profile.ok.allowFallback,inputModalities:profile.ok.inputModalities,outputModalities:profile.ok.outputModalities,maxInputTokens:profile.ok.maxInputTokens,maxOutputTokens:profile.ok.maxOutputTokens,inputConstraints:profile.ok.inputConstraints,upstreamInputLimits:profile.ok.upstreamInputLimits,updatedAt:'2026-10-03T00:00:00Z'}}
  const result=await transport.plan(request,{signal:new AbortController().signal})
  if(shape==='pure-image') assert.ok('planned' in result,JSON.stringify(result))
  else assert.deepEqual(result,{rejected:'unavailable'})
  cases.push({shape,result:'planned' in result?{planned:true,requestBytes:Buffer.byteLength(result.planned.serialized)}:result})
 }
 const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),observedAt:new Date().toISOString(),modelId:entry.definition.modelId,provider:entry.provider,definition:entry.definition.revision,implementation:entry.definition.implementation,cache:entry.cache,cases,networkRequests:0,scope:'One current official Anthropic leaf; local plan/cache selection only. Original paid study separately observed upstream acceptance of all three raw shapes.'}
 writeFileSync('tmp/test-tiers-mutation/anthropic-local-50.json',writeJsonLossless(report)+'\n')
 process.stdout.write(JSON.stringify({result:'REPRODUCED',networkRequests:0,modelId:entry.definition.modelId,cases:cases.map(c=>({shape:c.shape,result:c.result}))})+'\n')
} finally {await transport.close()}
