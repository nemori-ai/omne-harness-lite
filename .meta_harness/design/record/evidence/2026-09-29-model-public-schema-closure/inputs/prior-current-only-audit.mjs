import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
import crypto from 'node:crypto'
const hub='/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime'
const base=path.join(hub,'.meta_harness/design/spec')
const snapshot='96ae5241b935f7735051f2ffae452a6d978c383c'
const target=path.dirname(new URL(import.meta.url).pathname)
const readGit=p=>cp.execFileSync('git',['show',`${snapshot}:${p}`],{cwd:hub,encoding:'utf8'})
const cache=new Map()
const get=p=>{if(!cache.has(p))cache.set(p,JSON.parse(fs.readFileSync(path.join(base,p),'utf8')));return cache.get(p)}
function closure(root,names){const seen=new Set(),edges=[];function visit(p,fragment){const key=p+fragment;if(seen.has(key))return;seen.add(key);let node=get(p);for(const part of fragment.slice(2).split('/'))node=node[part.replace(/~1/g,'/').replace(/~0/g,'~')];if(!node)throw Error(key);function walk(v,pointer){if(!v||typeof v!=='object')return;if(v.$ref){const url=new URL(v.$ref,get(p).$id);const next=url.pathname.split('/spec/')[1];edges.push({from:key,pointer,ref:v.$ref,to:next+url.hash});visit(next,url.hash)}for(const [k,x]of Object.entries(v))if(k!=='$ref')walk(x,pointer+'/'+k)}walk(node,fragment)}for(const n of names)visit(root,'#/$defs/'+n);return{definitions:[...seen],resources:[...new Set([...seen].map(x=>x.split('#')[0]))],edges}}
const result={snapshot,roots:{},sourceHashes:{},schemaHashes:{}}
for(const p of ['messages','model-response','arrival-events','loop-extension']){const source=readGit(`packages/core/${p}/src/schema.ts`);result.sourceHashes[p]=crypto.createHash('sha256').update(source).digest('hex');const names=[...source.match(/SCHEMA_DEF_NAMES = Object.freeze\(\[([\s\S]*?)\] as const\)/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);const root=JSON.parse(readGit(`packages/core/${p}/schema/${p}.schema.json`)).$id.split('/spec/')[1];const actual=closure(root,names);const registered=[];for(const [,pkg,entry]of source.matchAll(/import \w+ from '@omne-harness-lite\/([^/]+)\/(schema[^']*)' with \{ type: 'json' \}/g)){const manifest=JSON.parse(readGit(`packages/core/${pkg}/package.json`));const exported=manifest.exports['./'+entry];const dest=typeof exported==='string'?exported:exported.default;const resource=JSON.parse(readGit(path.normalize(`packages/core/${pkg}/${dest}`))).$id.split('/spec/')[1];registered.push(resource)}result.roots[p]={root,publicNames:names,...actual,registeredResources:registered,requiredButUnregistered:actual.resources.filter(x=>!registered.includes(x)),registeredButUnreached:registered.filter(x=>!actual.resources.includes(x))};console.log(p,names.length,'defs;',actual.resources.length,'reached;',registered.length,'registered;',result.roots[p].registeredButUnreached.length,'unreached')}
result.loopDefinition=closure(result.roots['loop-extension'].root,['LoopExtensionDefinition'])
for(const[p,s]of cache)result.schemaHashes[p]=crypto.createHash('sha256').update(fs.readFileSync(path.join(base,p))).digest('hex')
fs.writeFileSync(path.join(target,'definition-closure.json'),JSON.stringify(result,null,2)+'\n')
const structure={checkedResources:cache.size,dynamicRefs:[],nestedIds:[],anchors:[]}
for(const[p,s]of cache){function inspect(x,pointer){if(!x||typeof x!=='object')return;if(x.$dynamicRef)structure.dynamicRefs.push({p,pointer,ref:x.$dynamicRef});if(pointer&&x.$id)structure.nestedIds.push({p,pointer,id:x.$id});if(x.$anchor||x.$dynamicAnchor)structure.anchors.push({p,pointer});for(const[k,v]of Object.entries(x))inspect(v,pointer+'/'+k)}inspect(s,'')}
fs.writeFileSync(path.join(target,'reference-structure-check.json'),JSON.stringify(structure,null,2)+'\n')
if(structure.dynamicRefs.length||structure.nestedIds.length||structure.anchors.length)throw Error('Unsupported reference structure: inspect reference-structure-check.json before consuming closure')
console.log('Reference structure:',structure.checkedResources,'resources; 0 dynamic refs / nested ids / anchors')
