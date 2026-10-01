from pathlib import Path
import json,copy,re
D=Path('.meta_harness/design'); S=D/'spec'
mr=S/'data/model-response/v9'; rt=S/'capabilities/model-request-runtime/v10'
mr.mkdir(parents=True,exist_ok=True);rt.mkdir(parents=True,exist_ok=True)
# Only new versions; preserve inherited obligations and exact external data dependencies.
a=(mr.parent/'v8/contract.md').read_text().replace('data.model-response v8','data.model-response v9').replace('data.model-response/v8','data.model-response/v9').replace('model-response/v8/','model-response/v9/').replace('data.model-response, 8','data.model-response, 9')
a=re.sub(r'> \*\*candidate，未接受、未冻结。\*\*[^\n]*', '> **candidate，未接受、未冻结。**本版以 D-104 已接受 MR8 为前驱，保留 S-1～S-40；S-41～S-45 新增同次响应的输入观察及输出组证据。当前格式必填，不提供旧实现兼容。',a,count=1)
a+='\n\n## 十、响应计量依据（本版增量）\n\n'
(mr/'contract.md').write_text(a)
a=(rt.parent/'v9/contract.md').read_text().replace('model-request-runtime v9','model-request-runtime v10').replace('model-request-runtime/v9','model-request-runtime/v10').replace('model-request-runtime, 9','model-request-runtime, 10').replace('data.model-response · v8','data.model-response · v9').replace('data.model-response/v8','data.model-response/v9').replace('model-response/v8/','model-response/v9/').replace('MR8','MR9')
a=re.sub(r'> \*\*candidate，未接受、未冻结。\*\*[^\n]*', '> **candidate，未接受、未冻结。**本版以 D-104 已接受 RT9 为前驱，保留 S-1～S-76 的既有义务，新增 S-77～S-83 的响应校准增量计量；不新增服务操作。',a,count=1)
a=a.replace('再按 S-74 计量全部实际输入并固定计划','再按 S-74/S-77～S-83 覆盖全部实际输入（可信前缀复用，仅分词新增）并固定计划')
a=a.replace('本候选现有 S-1～S-76','本候选现有 S-1～S-83')
(rt/'contract.md').write_text(a+'\n\n## 十五、响应校准的增量输入计量\n\n')
# Clone only registered inherited normative artifacts, no generated trace files.
cat=json.loads((D/'registry/catalog.json').read_text())
entries=next(v for v in cat.values() if isinstance(v,list))
old=next(x for x in entries if x['coordinate']['contract_id']=='capability.model-request-runtime' and x['coordinate']['version']==9)
for name in old['resources']:
 p=D/name
 if p.name in ['contract.md','examples.md','consumer-impact.md'] or not p.exists():continue
 out=rt/p.relative_to(rt.parent/'v9');out.parent.mkdir(parents=True,exist_ok=True)
 out.write_text(p.read_text().replace('model-request-runtime/v9','model-request-runtime/v10').replace('MR8','MR9'))
# MR schema preserves exact shape clauses and adds shared new fact definitions.
d=json.loads((mr.parent/'v8/model-response.schema.json').read_text());d['$id']=d['$id'].replace('/v8/','/v9/')
Dfs=d['$defs']
def obj(props,req=None): return {'type':'object','additionalProperties':False,'required':list(props) if req is None else req,'properties':props}
def st():return {'type':'string','minLength':1}
def ref(n):return {'$ref':'#/$defs/'+n}
def unav(reasons):return obj({'kind':{'const':'unavailable'},'reason':{'enum':reasons}})
digest={'type':'string','pattern':'^[0-9a-f]{64}$'}
Dfs['CountingBasis']=obj({'binding':{'$ref':'../../model-profile/v5/model-profile.schema.json#/$defs/ModelAdaptationBinding'},'model':st(),'provider':st(),'tokenizerRevision':st(),'meterRevision':st(),'projectionRevision':st(),'replayRevision':st(),'transformRevision':st()})
Dfs['RequestInputEvidence']={'oneOf':[obj({'kind':{'const':'known'},'projectionRevision':st(),'prefixBoundary':{'type':'integer','minimum':0},'prefixDigest':digest,'inputEnvelopeDigest':digest,'countingBasis':ref('CountingBasis')}),unav(['not_retained','not_sent','send_unknown'])]}
Dfs['ObservationProvenance']=obj({'adapterRevision':st(),'fieldPaths':{'type':'array','minItems':1,'uniqueItems':True,'items':st()},'upstreamRequestId':st(),'upstreamModel':st(),'servingProvider':st()},['adapterRevision','fieldPaths'])
Dfs['ObservedInput']={'oneOf':[obj({'kind':{'const':'from_usage'},'provenance':ref('ObservationProvenance')}),obj({'kind':{'const':'upstream_total'},'tokens':{'type':'integer','minimum':0},'provenance':ref('ObservationProvenance')}),unav(['missing_usage','response_cache','inconsistent_usage','scope_unknown','not_sent','send_unknown'])]}
Dfs['OutputGroupEvidence']={'oneOf':[obj({'kind':{'const':'known'},'source':{'enum':['reply','delivered','none']},'blockDigests':{'type':'array','items':digest},'completeness':{'enum':['complete','partial']},'usageRef':{'const':'usage'}}),unav(['not_retained','not_sent','send_unknown'])]}
Dfs['InputCalibration']=obj({'requestInput':ref('RequestInputEvidence'),'observedInput':ref('ObservedInput'),'outputGroup':ref('OutputGroupEvidence')})
for n in ['ModelResponse','PendingModelResponse']:
 Dfs[n]['required'].append('inputCalibration');Dfs[n]['properties']['inputCalibration']=ref('InputCalibration')
Dfs['ResponseFactsConstraints']['allOf'].append({'$comment':'S-42 from_usage requires three known disjoint input components, from upstream.','if':{'properties':{'inputCalibration':{'properties':{'observedInput':{'properties':{'kind':{'const':'from_usage'}}}}}}},'then':{'properties':{'usage':{'properties':{'source':{'const':'upstream'},**{k:{'type':'integer','minimum':0} for k in ['input_tokens','cache_read_tokens','cache_write_tokens']}}}}}})
Dfs['ResponseFactsConstraints']['allOf'].append({'$comment':'S-42 upstream_total is the sole input authority only when at least one CA2 input component is unknown.','if':{'properties':{'inputCalibration':{'properties':{'observedInput':{'properties':{'kind':{'const':'upstream_total'}}}}}}},'then':{'properties':{'usage':{'anyOf':[{'properties':{k:{'const':'unknown'}}} for k in ['input_tokens','cache_read_tokens','cache_write_tokens']]}}}})
(mr/'model-response.schema.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
