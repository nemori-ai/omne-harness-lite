// One explicit live request only; default mode performs local planning with no key or network.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { writeJsonLossless } from '../../packages/core/content-blocks/dist/index.js'
import { judgeMessage } from '../../packages/core/messages/dist/index.js'
import { parseOpaqueIdentifier, unwrap } from '../../packages/core/identity-values/dist/index.js'
import { invokeModel, openRouterCredentialRedactionConfig } from '../../packages/model/model-request-runtime/dist/index.js'
import { createPiAiTransport, createMoonshotInputMeter, moonshotDefinitions, createOfficialProfileContent, createSharpImageCodec, modelImageBalancedV1 } from '../../packages/model/pi-ai-transport/dist/index.js'
import { readCredential } from '../../tools/model-probe/src/network.mjs'
import { openLedger, usdUnits, usdString } from '../../tools/model-probe/src/budget.mjs'
import { privateOutputDirectory, writePrivateEvidence, paidInvocation } from '../../tools/model-probe/src/production-gate.mjs'
const sharp = createRequire(new URL('../../packages/model/pi-ai-transport/package.json', import.meta.url))('sharp')
const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
assert.equal(commit,'56c446ab842e2e2e69a120755019e2ad553e09e1')
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'')
const modelId='moonshotai/kimi-k3', provider='moonshotai/mxfp4'
const definition=moonshotDefinitions.find(d=>d.modelId===modelId)!
assert.equal(definition.implementation.revision,'mp4-19')
const profile=createOfficialProfileContent(definition,{providers:[provider],allowFallback:false,configuration:{revision:'1',values:{cache:{mode:'automatic'}}}})
assert.ok('ok' in profile)
const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#d64541'}}).png().toBuffer()
const visible={toHuman:true,toModel:true}
function message(raw: unknown) { const judged=judgeMessage(raw); assert.ok('ok' in judged); return judged.ok }
const request={target:{kind:'model_call' as const,callId:unwrap(parseOpaqueIdentifier('mv5-live-one','ModelCallId')),dispatch:1},routeName:modelId,provider,calibration:{kind:'none' as const,reason:'no_observation' as const},outputHistory:[],tokenMargin:{multiplier:1.2,reserveTokens:32},parameters:{maxOutputTokens:64,reasoningEffort:'low' as const},tools:[],messages:[message({type:'system',id:'system',createdAt:'2026-10-03T00:00:00Z',blocks:[{id:'instruction',kind:'text',text:'Reply with one short sentence about the image.',visibility:visible}]}),message({type:'user',id:'image-user',createdAt:'2026-10-03T00:00:00Z',blocks:[{id:'image',kind:'image',mediaType:'image/png',data:{inline:bytes.toString('base64')},visibility:visible},{id:'empty',kind:'text',text:'',visibility:visible}]})],snapshot:{adaptation:profile.ok.adaptation,providers:profile.ok.providers,allowFallback:profile.ok.allowFallback,inputModalities:profile.ok.inputModalities,outputModalities:profile.ok.outputModalities,maxInputTokens:profile.ok.maxInputTokens,maxOutputTokens:profile.ok.maxOutputTokens,inputConstraints:profile.ok.inputConstraints,upstreamInputLimits:profile.ok.upstreamInputLimits,updatedAt:'2026-10-03T00:00:00Z'}}
const transport=createPiAiTransport({definitions:[definition],inputMeters:[createMoonshotInputMeter(definition)],imagePreparation:{policy:modelImageBalancedV1,codec:createSharpImageCodec(sharp)},policy:{maxConnections:1,idleConnectionTimeoutMs:30000,connectTimeoutMs:20000,maxErrorBodyBytes:16384,maxSseEventBytes:65536,credentialRedaction:openRouterCredentialRedactionConfig}})
const controller=new AbortController()
const planned=await transport.plan(request,{signal:controller.signal})
assert.ok('planned' in planned,JSON.stringify(planned))
const wire=JSON.parse(planned.planned.serialized)
assert.deepEqual(wire.messages[1].content.map((p:{type:string})=>p.type),['image_url'])
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex')
const summary={commit,definition:definition.revision,implementation:definition.implementation,modelId,provider,sourceImageSha256:sha(bytes),serializedSha256:sha(planned.planned.serialized),requestBytes:Buffer.byteLength(planned.planned.serialized),sourceShape:['image','empty-text'],finalShape:['image_url'],measurement:planned.planned.measurement,requestInput:planned.planned.requestInput}
if (!process.argv.includes('--live')) {
 process.stdout.write(writeJsonLossless({result:'LOCAL_PLAN_PASS',networkRequests:0,...summary})+'\n')
 await transport.close()
} else {
 const out=await privateOutputDirectory(resolve('tmp/test-tiers-mutation/live50-r1'))
 const ledgerPath=resolve(out,'ledger.json')
 const archive='.meta_harness/research/empty-text-part-acceptance/reports/archive'
 const provenance=JSON.parse(await readFile(`${archive}/provenance.json`,'utf8'))
 let historical=0n, records=0
 for (const item of provenance.files.filter((item:{file:string})=>item.file.endsWith('.json'))) {
  const raw=await readFile(resolve('.meta_harness/research/empty-text-part-acceptance',item.file),'utf8')
  assert.equal(sha(raw),item.stored_sha256)
  const result=JSON.parse(raw)
  if (result.costUsd!==null) historical+=usdUnits(result.costUsd)
  records++
 }
 assert.equal(records,97); assert.equal(historical,usdUnits('0.2320266'))
 try { await stat(ledgerPath) } catch(error) {
  if ((error as {code:string}).code!=='ENOENT') throw error
  await writeFile(ledgerPath,JSON.stringify({format:1,limitUsd:'5',researchLimitUsd:'5',entries:[{id:'historical-97-probes',model:'31 archived fixed routes',provider:'original fixed providers',stage:'research',estimateUsd:usdString(historical),state:'settled',actualUsd:usdString(historical),costSource:{evidence:'97 original receipts; historical aggregate, not a new effect',sha256:sha(await readFile(`${archive}/provenance.json`))}}]},null,2)+'\n',{mode:0o600,flag:'wx'})
 }
 const ledger=await openLedger(ledgerPath,{limitUsd:'5',researchLimitUsd:'5'})
 assert.equal(ledger.snapshot().entries.length,1,'Do not repeat this paid request or substitute a new ledger')
 const credential=await readCredential('/data/qiwei/repos/omne-harness-lite/.env')
 await writePrivateEvidence(resolve(out,'planned-request.json'),planned.planned.serialized+'\n')
 await writePrivateEvidence(resolve(out,'preflight.json'),writeJsonLossless({historicalCostUsd:usdString(historical),reservationUsd:'1',...summary})+'\n')
 const startedAt=new Date().toISOString()
 let sends=0
 const observed={...transport,send:async (...args:Parameters<typeof transport.send>)=>{
  assert.equal(++sends,1,'Only one external send authorized in this run')
  assert.equal(args[0].serialized,planned.planned.serialized,'Actual send must consume the fixed measured bytes')
  return transport.send(...args)
 }}
 const deadline=setTimeout(()=>controller.abort(),120000)
 let recorded=false
 try {
  const receipt=await paidInvocation(ledger,{model:modelId,provider,stage:'acceptance',estimateUsd:'1'},async(id:string)=>{
   const handle=invokeModel({...request,transport:observed,credential,signal:controller.signal,policy:{now:()=>new Date().toISOString(),schedule:(ms:number,fn:()=>void)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer)},firstContentTimeoutMs:90000,idleContentTimeoutMs:30000,statusCauseTable:{'400':'request_rejected','401':'credential_unavailable','402':'upstream_unavailable','429':'upstream_unavailable','503':'upstream_unavailable'},credentialRedaction:openRouterCredentialRedactionConfig,diagnostic:()=>{}}})
   const outcome=await handle.outcome
   const facts=handle.observedFacts()
   const cost='cost' in outcome ? outcome.cost.cost_usd : 'facts' in facts ? facts.facts.cost.cost_usd : 'unknown'
   const actualUsd=cost==='unknown'?undefined:writeJsonLossless(cost)
   if(actualUsd!==undefined) usdUnits(actualUsd)
   const report={id,startedAt,endedAt:new Date().toISOString(),sends,...summary,outcome,observedFacts:facts,actualUsd:actualUsd??'unknown',limits:'One Kimi route, one image input, one sample; no 37-model certification, history-position or all-empty upstream claim.'}
   const serialized=writeJsonLossless(report)
   if(serialized.includes(credential)) throw new Error('Credential-like response withheld; reconcile externally')
   await writePrivateEvidence(resolve(out,'result.json'),serialized.replace(/org_[A-Za-z0-9_-]+/g,'org_REDACTED')+'\n')
   recorded=true
   return {actualUsd,outcome: 'outcome' in outcome ? outcome.outcome : 'before-send-rejection',sends}
  })
  process.stdout.write(JSON.stringify({result:'RECORDED',commit,sends,receipt:receipt.receipt,ledgerEntries:ledger.snapshot().entries.length})+'\n')
 } finally { clearTimeout(deadline); await transport.close(); await ledger.close(); if(!recorded) process.stderr.write('No completed receipt recorded; retain ledger state and stop.\n') }
}
