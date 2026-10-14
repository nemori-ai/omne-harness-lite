import { describe, expect, it } from 'vitest'
import { extractArchitecture } from '../src/arch/extract.ts'
import { snapshotOf } from './architecture-snapshot.ts'

const source = 'packages/session/example/src/plugin.ts'
function extract(text: string, extra: Record<string, string> = {}) {
  return extractArchitecture(
    snapshotOf(
      new Map(
        Object.entries({
          'packages/session/example/package.json':
            '{"name":"@omne-harness/example","exports":{".":"./dist/index.js"}}',
          [source]: text,
          ...extra,
        }),
      ),
    ),
  )
}
const prelude = `import { definePlugin as plugin } from '@omne-harness/kernel-basis'
import { Context as C, Service } from '@deepseek-ai/cordis'
`

const contextCases: readonly {
  label: string
  header: string
  parameterType: string
  extra?: Record<string, string>
}[] = [
  {
    label: 'direct',
    header: "import {Context as C} from '@deepseek-ai/cordis'",
    parameterType: 'C',
  },
  {
    label: 'namespace',
    header: "import * as Cordis from '@deepseek-ai/cordis'",
    parameterType: 'Cordis.Context',
  },
  {
    label: 'local aliases',
    header: "import {Context} from '@deepseek-ai/cordis';type C=Context;type D=(C)",
    parameterType: 'D',
  },
  {
    label: 'barrel aliases',
    header: "import type {PublicContext as C} from './barrel.js'",
    parameterType: 'C',
    extra: {
      'packages/session/example/src/context.ts':
        "export type {Context as C} from '@deepseek-ai/cordis'",
      'packages/session/example/src/barrel.ts':
        "export type {C as PublicContext} from './context.js'",
    },
  },
  {
    label: 'barrel namespace',
    header: "import * as Types from './context.js'",
    parameterType: 'Types.C',
    extra: {
      'packages/session/example/src/context.ts':
        "export type {Context as C} from '@deepseek-ai/cordis'",
    },
  },
]

describe('static architecture extraction', () => {
  it('resolves a metadata append through a public tree export without executing the provider', () => {
    const result = extract(
      `${prelude}
export const actual = Object.assign(plugin({name:'managed',inject:['storage'],apply(ctx){ctx.provide('provided',{})}}),
 {assemblyLifecycle:1 as const,describeAssembly:()=>{throw Error('must not execute')}})
`,
      {
        'packages/session/example/package.json':
          '{"name":"@omne-harness/example","exports":{".":"./dist/index.js","./cordis":"./dist/cordis.js"}}',
        'packages/session/example/src/cordis.ts': "export {actual as Managed} from './plugin.js'",
        'apps/host/package.json': '{"name":"host"}',
        'apps/host/src/tree.ts':
          "export function tree(){return [{id:'entry',plugin:{package:'@omne-harness/example',export:'Managed'},config:{}}]}",
      },
    )
    expect(result.facts.find(f => f.kind === 'composition')).toMatchObject({
      key: 'entry',
      plugin: 'managed',
      target: 'packages/session/example',
      layer: 'distribution',
    })
    expect(result.unknown.filter(f => f.kind === 'composition')).toEqual([])
    expect(result.facts.find(f => f.kind === 'injects')).toMatchObject({
      key: 'storage',
      plugin: 'managed',
    })
  })
  it.each([
    "Object.assign(base,{name:'override'})",
    "Object.assign(base,{apply(ctx){ctx.provide('override',{})}})",
    "Object.assign(base,{inject:['override']})",
    'Object.assign(base,{Config:factory()})',
    'Object.assign(base,{...metadata})',
    'Object.assign(base,{get assemblyLifecycle(){return 1}})',
    'Object.assign(Object.assign(base,{assemblyLifecycle:1}),{assemblyLifecycle:2})',
    'arbitrary(base)',
    "Object.assign(base,{assemblyLifecycle:1},{name:'override'})",
  ])('keeps unsafe wrappers unresolved: %s', wrapper => {
    const result = extract(
      `${prelude}
const base=plugin({name:'original',apply(ctx){ctx.provide('provided',{})}})
export const actual=${wrapper}
`,
      {
        'apps/host/package.json': '{"name":"host"}',
        'apps/host/src/manifest.ts':
          "import {actual} from '@omne-harness/example';export const rows=[{id:'entry',plugin:actual}]",
      },
    )
    expect(result.facts.filter(f => f.kind === 'composition')).toEqual([])
    expect(result.unknown.filter(f => f.kind === 'composition')).toHaveLength(1)
  })
  it('does not trust a locally shadowed Object.assign', () => {
    const result = extract(
      `${prelude}
const Object={assign(first,second){return unrelated()}}
export const actual=Object.assign(plugin({name:'managed',apply(ctx){ctx.provide('provided',{})}}),{assemblyLifecycle:1})
`,
      {
        'apps/host/package.json': '{"name":"host"}',
        'apps/host/src/manifest.ts':
          "import {actual} from '@omne-harness/example';export const rows=[{id:'entry',plugin:actual}]",
      },
    )
    expect(result.facts.filter(f => f.kind === 'composition')).toEqual([])
    expect(result.unknown.filter(f => f.kind === 'composition')).toHaveLength(1)
  })
  it.each([
    ['@omne-harness/example', 'Missing'],
    ['@omne-harness/example/private', 'Managed'],
    ['./provider', 'Managed'],
  ])('does not invent a tree target for %s#%s', (packageName, exported) => {
    const result = extract(`${prelude}export const actual=plugin({name:'managed',apply(ctx){}})`, {
      'packages/session/example/package.json':
        '{"name":"@omne-harness/example","exports":{"./cordis":"./dist/cordis.js"}}',
      'packages/session/example/src/cordis.ts': "export {actual as Managed} from './plugin.js'",
      'apps/host/package.json': '{"name":"host"}',
      'apps/host/src/tree.ts': `export const rows=[{id:'entry',plugin:{package:'${packageName}',export:'${exported}'},config:{}}]`,
    })
    expect(result.facts.filter(f => f.kind === 'composition')).toEqual([])
    expect(result.unknown.filter(f => f.kind === 'composition')).toHaveLength(1)
  })
  it.each(['@omne-harness/kernel-basis', '@omne-harness/kernel-basis/cordis'])(
    'recognizes binding helpers from current and historical public entry %s',
    entry => {
      const result = extract(`
import { definePlugin as plugin, resolveOptional as optional } from '${entry}'
export const p = plugin({ name: 'p', inject: ['required'], apply(ctx) {
  optional(ctx, 'optional-service')
  ctx.provide('provided-service', {})
} })
`)
      expect(result.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'injects', key: 'required', plugin: 'p' }),
          expect.objectContaining({ kind: 'optional', key: 'optional-service', plugin: 'p' }),
          expect.objectContaining({ kind: 'provides', key: 'provided-service', plugin: 'p' }),
        ]),
      )
      expect(result.unknown).toEqual([])
    },
  )

  it.each([
    '@omne-harness/kernel-basis-other/cordis',
    '@omne-harness/kernel-basis/private',
  ])('does not trust helpers from %s', entry => {
    const result = extract(`
import { definePlugin as plugin, resolveOptional as optional } from '${entry}'
export const p = plugin({ apply(ctx) { optional(ctx, 'optional-service') } })
`)
    expect(result.facts.some(fact => fact.key === 'optional-service')).toBe(false)
  })

  it('keeps unowned helpers beside manifests and plugins without duplicating reached helpers', () => {
    const appSource = 'apps/host/src/index.ts'
    const result = extract('', {
      'apps/host/package.json': '{"name":"@fixture/host","exports":{".":"./dist/index.js"}}',
      [appSource]: `${prelude}
export function reached(ctx: C) { ctx.provide('owned-helper', {}) }
export const live = plugin({ name: 'live', apply(ctx) { reached(ctx); ctx.provide('live-service', {}) } })
export function assemble(ctx: C) { ctx.get(dynamicKey()); ctx.provide('unowned-service', {}) }
export const manifest = [{ id: 'live-component', plugin: live }]
`,
    })
    expect(result.facts.filter(f => f.kind === 'provides' && f.key === 'owned-helper')).toEqual([
      expect.objectContaining({ plugin: 'live', path: appSource }),
    ])
    expect(result.facts.filter(f => f.kind === 'provides' && f.key === 'unowned-service')).toEqual([
      expect.objectContaining({ path: appSource, scope: 'top' }),
    ])
    expect(result.facts.find(f => f.key === 'unowned-service')?.plugin).toBeUndefined()
    expect(result.facts.some(f => f.kind === 'composition' && f.key === 'live-component')).toBe(
      true,
    )
    expect(result.unknown).toEqual([
      expect.objectContaining({
        expression: 'dynamicKey()',
        path: appSource,
        scope: 'top',
        kind: 'optional',
        serviceIdentifier: true,
      }),
    ])
    expect(result.unknown[0]?.plugin).toBeUndefined()
    expect(result.serviceIdentifiers.unresolved).toBe(1)
  })

  it('resolves workspace public re-exports, aliases and static class keys without merging plugins', () => {
    const result = extract(
      `${prelude}
import { KEY as storage } from '@omne-harness/keys'
export const a = plugin({ name: 'a', inject: [storage], apply(ctx) {
  ctx.get(storage); ctx.get('clock'); ctx.provide('alpha', {});
  const ordinary = { get() {}, on() {}, provide() {} }; ordinary.get('fake'); ordinary.on('fake'); ordinary.provide('fake');
}})
export const b = plugin({ name: 'b', apply(ctx) { ctx.get(storage); ctx.provide('beta', {}) } })
`,
      {
        'packages/core/keys/package.json':
          '{"name":"@omne-harness/keys","exports":{".":"./dist/index.js"}}',
        'packages/core/keys/src/index.ts': "export { KEY } from './keys.js'",
        'packages/core/keys/src/keys.ts':
          "import { Base } from './service.js'; export const KEY = Base.provide",
        'packages/core/keys/src/service.ts': `${prelude}/** @contract capability.storage */\nexport abstract class Base extends Service { static readonly provide = 'storage' }`,
      },
    )
    expect(result.unknown).toEqual([])
    expect(
      result.facts.filter(f => f.plugin === 'a' && f.kind === 'injects').map(f => f.key),
    ).toEqual(['storage'])
    expect(
      result.facts.filter(f => f.plugin === 'a' && f.kind === 'optional').map(f => f.key),
    ).toEqual(['clock'])
    expect(
      result.facts.filter(f => f.plugin === 'b' && f.kind === 'optional').map(f => f.key),
    ).toEqual(['storage'])
    expect(result.facts.filter(f => f.kind === 'provides').map(f => [f.plugin, f.key])).toEqual([
      ['a', 'alpha'],
      ['b', 'beta'],
    ])
    expect(result.facts.find(f => f.kind === 'injects')?.declaration).toMatchObject({
      member: 'packages/core/keys',
      path: 'packages/core/keys/src/service.ts',
    })
    expect(result.facts.find(f => f.kind === 'defines')).toMatchObject({
      key: 'storage',
      contract: 'capability.storage',
    })
    expect(result.imports.find(f => f.local === 'storage')).toMatchObject({
      symbol: 'KEY',
      type: false,
    })
  })

  it('follows a cross-file helper per plugin, preserves nested inject scope and lexical shadows', () => {
    const result = extract(
      `${prelude}
import { applySessionLog } from './owner.js'
const KEY = 'root'
export const a = plugin({ name: 'a', apply: applySessionLog })
export const b = plugin({ name: 'b', apply(ctx) {
  const KEY = dynamicKey(); ctx.get(KEY)
  ctx.inject(['inner'], child => { child.get('inner'); child.provide('child', {}) })
  (() => { const ctx = { provide() {} }; ctx.provide('fake') })()
} })
`,
      {
        'packages/session/example/src/owner.ts': `${prelude}export function applySessionLog(ctx: C) { ctx.provide('sessionLog', {}); ctx.on('log/appended', () => {}) }`,
      },
    )
    expect(
      result.facts.filter(f => f.plugin === 'a' && f.kind === 'provides').map(f => f.key),
    ).toEqual(['sessionLog'])
    expect(result.facts.some(f => f.plugin === 'b' && f.key === 'sessionLog')).toBe(false)
    expect(result.facts.some(f => f.key === 'fake')).toBe(false)
    expect(result.facts.find(f => f.key === 'child')?.scope).toContain('inject:')
    expect(result.facts.some(f => f.kind === 'optional' && f.key === 'inner')).toBe(false)
    expect(result.unknown).toEqual([
      expect.objectContaining({
        expression: 'KEY',
        plugin: 'b',
        kind: 'optional',
        serviceIdentifier: true,
      }),
    ])
    expect(result.serviceIdentifiers.unresolved).toBe(1)
  })

  it('keeps event declaration mode, Service providers, native plugin objects and named exports', () => {
    const result = extract(`${prelude}
declare module '@deepseek-ai/cordis' { interface Events {
/** @mode parallel */
'example/done'(): void
} }
/** @owner packages/core/example */
export abstract class Base extends Service { static readonly provide = 'registry' }
class Registry extends Base { constructor(ctx: C) { super(ctx, Base.provide) } }
export const native = { name: 'native', inject: ['registry'], apply(ctx: C) { new Registry(ctx); ctx.registry.register({}); ctx.parallel('example/done'); ctx.once('example/done', () => {}) } }
export const name = 'exported'; export const inject = ['clock']; export function apply(ctx: C) { ctx.provide('another', {}) }
`)
    expect(result.facts.find(f => f.kind === 'event-declaration')).toMatchObject({
      key: 'example/done',
      mode: 'parallel',
    })
    expect(result.facts.find(f => f.kind === 'provides' && f.plugin === 'native')).toMatchObject({
      key: 'registry',
    })
    expect(result.facts.find(f => f.kind === 'contributes')).toMatchObject({
      key: 'registry',
      plugin: 'native',
    })
    expect(result.facts.find(f => f.kind === 'emits')).toMatchObject({
      key: 'example/done',
      mode: 'parallel',
    })
    expect(result.facts.find(f => f.kind === 'injects' && f.plugin === 'exported')).toMatchObject({
      key: 'clock',
    })
  })

  it('excludes test and example source, terminates cyclic constants, and records unresolved keys', () => {
    const result = extract(
      `${prelude}const A = B; const B = A; export const a = plugin({name:'a',inject:[A],apply(ctx){ctx.emit(dynamicEvent());ctx.provide(dynamicKey(),{})}})`,
      {
        'packages/session/example/src/fake.spec.ts': `${prelude}export const fake = plugin({name:'test',apply(ctx){ctx.provide('fake',{})}})`,
        'examples/demo/src/index.ts': `${prelude}export const fake = plugin({name:'example',apply(ctx){ctx.provide('fake',{})}})`,
      },
    )
    expect(result.facts.filter(f => f.kind === 'plugin').map(f => f.key)).toEqual(['a'])
    expect(result.serviceIdentifiers.unresolved).toBe(2)
    expect(result.unknown).toHaveLength(3)
    expect(result.unknown.find(f => f.kind === 'emits')?.serviceIdentifier).toBe(false)
    expect(result.serviceIdentifiers.rate).toBe(1)
  })

  it('reads the static manifest references and preserves type imports and mixed exported names', () => {
    const result = extract(
      `${prelude}export const actual = plugin({name:'a',apply(ctx){ctx.provide('a',{})}})`,
      {
        'packages/session/example/src/index.ts': "export { actual as exported } from './plugin.js'",
        'apps/host/package.json': '{"name":"host"}',
        'apps/host/src/manifest.ts':
          "import { exported as local, type Other } from '@omne-harness/example'; export function build(){return [{name:'entry',plugin:local,config:factory()}]}",
      },
    )
    expect(result.facts.find(f => f.kind === 'composition')).toMatchObject({
      key: 'entry',
      target: 'packages/session/example',
      plugin: 'a',
      layer: 'distribution',
    })
    expect(
      result.imports.filter(f => f.member === 'apps/host').map(f => [f.symbol, f.local, f.type]),
    ).toEqual([
      ['exported', 'local', false],
      ['Other', 'Other', true],
    ])
  })
  it.each(contextCases)(
    'retains plugin and provides for $label Context origin',
    ({ header, parameterType, extra }) => {
      const result = extract(
        `import {definePlugin} from '@omne-harness/kernel-basis';
${header};export const p=definePlugin({name:'p',apply(ctx:${parameterType}){ctx.provide('svc',{})}})`,
        extra,
      )
      expect(result.unknown).toEqual([])
      expect(result.facts.filter(f => f.kind === 'provides')).toEqual([
        expect.objectContaining({ key: 'svc', plugin: 'p' }),
      ])
      expect(
        result.facts
          .filter(f => ['plugin', 'provides'].includes(f.kind))
          .map(f => f.kind)
          .sort(),
      ).toEqual(['plugin', 'provides'])
    },
  )
  it('rejects ordinary namespace/type aliases and terminates cyclic type aliases', () => {
    const result = extract(`${prelude}
namespace Cordis {export interface Context {provide(name:string,value:unknown):void}}
type Ordinary = {provide(name:string,value:unknown):void}; type Local = Ordinary
type A=B; type B=A
export const a=plugin({name:'a',apply(ctx:Cordis.Context){ctx.provide('namespaceFake',{})}})
export const b=plugin({name:'b',apply(ctx:Local){ctx.provide('aliasFake',{})}})
export const c=plugin({name:'c',apply(ctx:A){ctx.provide('cycleFake',{})}})
`)
    expect(result.facts.filter(f => f.kind === 'plugin')).toHaveLength(3)
    expect(result.facts.filter(f => f.kind === 'provides')).toEqual([])
    expect(result.serviceIdentifiers.attempted).toBe(0)
  })
  it('uses module public name/apply aliases including a local re-export barrel', () => {
    const result = extract(
      `${prelude}
const identifier='p'; const dependencies=['clock']
function run(ctx:C){ctx.provide('svc',{})}
export {identifier as name, run as apply, dependencies as inject}
`,
      {
        'packages/session/example/src/index.ts': "export {name, apply, inject} from './plugin.js'",
      },
    )
    expect(result.facts.filter(f => f.kind === 'plugin').map(f => f.key)).toEqual(['p'])
    expect(result.facts.filter(f => f.kind === 'provides')).toEqual([
      expect.objectContaining({ key: 'svc', plugin: 'p' }),
    ])
    expect(result.facts.filter(f => f.kind === 'injects').map(f => f.key)).toEqual(['clock'])
    expect(result.facts.find(f => f.kind === 'provides')).toMatchObject({ key: 'svc', plugin: 'p' })
  })
  it.each([
    'export const data={label:name}',
    'export {name as label, apply as work}',
    'export type {name, apply}',
    'export {name}',
  ])('does not fabricate a native plugin for internal name/apply with %s', exports => {
    const result = extract(
      `${prelude}const name='p';function apply(ctx:C){ctx.provide('svc',{})};${exports}`,
    )
    expect(result.facts.filter(f => f.kind === 'plugin')).toEqual([])
    expect(result.facts.filter(f => f.plugin !== undefined)).toEqual([])
    expect(result.unknown.filter(f => f.kind === 'plugin')).toEqual([])
  })
  it.each([
    ['static name=getName()', 'getName()'],
    ['static name:string', 'name'],
    ['static get name(){return getName()}', 'static get name(){return getName()}'],
  ])(
    'reports unknown class metadata for %s without proving a missing plugin',
    (metadata, expression) => {
      const result = extract(
        `${prelude}export class P {${metadata};constructor(ctx:C){ctx.provide('svc',{})}}`,
      )
      expect(result.facts.filter(f => f.kind === 'plugin')).toEqual([])
      expect(result.unknown).toEqual([
        expect.objectContaining({
          path: source,
          line: 3,
          kind: 'plugin',
          expression,
          reason: expect.any(String),
          serviceIdentifier: false,
        }),
      ])
      expect(result.unknown.filter(f => f.kind === 'plugin')).toHaveLength(1)
      expect(result.serviceIdentifiers).toEqual({ attempted: 1, unresolved: 0, rate: 0 })
    },
  )
  it('keeps static class metadata definite and records dynamic Service names separately from service keys', () => {
    const normal = extract(
      `${prelude}export class P {static name='p';constructor(ctx:C){ctx.provide('svc',{})}}`,
    )
    expect(normal.unknown).toEqual([])
    expect(normal.facts.map(f => f.kind).sort()).toEqual(['plugin', 'provides'])
    const dynamic = extract(
      `${prelude}export class P extends Service {static provide='svc';static name=getName();constructor(ctx:C){super(ctx)}}`,
    )
    expect(dynamic.unknown).toEqual([
      expect.objectContaining({
        kind: 'plugin',
        expression: 'getName()',
        serviceIdentifier: false,
      }),
    ])
    expect(dynamic.facts.find(f => f.kind === 'defines')).toMatchObject({ key: 'svc' })
    expect(dynamic.serviceIdentifiers).toEqual({ attempted: 2, unresolved: 0, rate: 0 })
    expect(dynamic.facts.filter(f => f.kind === 'plugin')).toEqual([])
  })
  it('resolves repeated const operands without weakening recursive-cycle detection', () => {
    const result = extract(`${prelude}const A='s';const B=A+A;const X=Y+'x';const Y=X;
export const p=plugin({name:'p',apply(ctx){ctx.provide(A+A,{});ctx.provide(B+B,{});ctx.provide(X,{})}})`)
    expect(result.facts.filter(f => f.kind === 'provides').map(f => f.key)).toEqual(['ss', 'ssss'])
    expect(result.unknown).toEqual([
      expect.objectContaining({ kind: 'provides', expression: 'X', serviceIdentifier: true }),
    ])
    expect(result.serviceIdentifiers).toEqual({ attempted: 3, unresolved: 1, rate: 1 / 3 })
  })
  it('propagates only confirmed Context through extend including inline and repeated extensions', () => {
    const result = extract(`${prelude}export const p=plugin({name:'p',apply(ctx){
 const child=ctx.extend({});child.provide('svc',{});ctx.extend({}).extend({}).on('extended/event',()=>{})
 const ordinary={extend(){return {provide(){},on(){}}}};const other=ordinary.extend({});other.provide('fake',{});ordinary.extend({}).on('fake/event',()=>{})
 const x=y;const y=x;x.extend({}).provide('cycleFake',{})
}})`)
    expect(result.unknown).toEqual([])
    expect(result.facts.filter(f => f.kind === 'provides')).toEqual([
      expect.objectContaining({ key: 'svc', plugin: 'p' }),
    ])
    expect(result.facts.filter(f => f.kind === 'listens')).toEqual([
      expect.objectContaining({ key: 'extended/event', plugin: 'p' }),
    ])
    expect(result.facts.some(f => f.key.includes('fake') || f.key === 'cycleFake')).toBe(false)
  })
  it('uses only static provide/name/inject metadata and keeps legacy super keys', () => {
    const result = extract(`${prelude}
class S extends Service {
  provide = 'ordinary-field'; name = 'ordinary-name'; inject = ['ordinary-inject']
  constructor(ctx:C) {super(ctx, 'actual-service')}
}
class StaticService extends Service {
  static provide = 'static-service'; static name = 'static-plugin'; static inject = ['static-dependency']
  provide = 'another-ordinary-field'
  constructor(ctx:C) {super(ctx)}
}
export class NativeClass {
  name = 'ordinary-native-name'; inject = ['ordinary-native-inject']
  constructor(ctx:C) {ctx.provide('nativeService', {})}
}
`)
    expect(result.facts.filter(f => f.kind === 'defines').map(f => f.key)).toEqual([
      'actual-service',
      'static-service',
    ])
    expect(result.facts.filter(f => f.kind === 'plugin').map(f => f.key)).toEqual([
      'NativeClass',
      'S',
      'static-plugin',
    ])
    expect(result.facts.filter(f => f.kind === 'provides').map(f => f.key)).toEqual([
      'nativeService',
      'actual-service',
      'static-service',
    ])
    expect(result.facts.filter(f => f.kind === 'injects').map(f => f.key)).toEqual([
      'static-dependency',
    ])
    expect(
      result.facts.some(f => f.key.startsWith('ordinary') || f.key === 'another-ordinary-field'),
    ).toBe(false)
  })
  it('rejects ordinary name/apply objects and requires native Context, Plugin type or registration provenance', () => {
    const result = extract(`${prelude}
import type {Plugin} from '@deepseek-ai/cordis'
const writer = {name:'text-writer',apply(writer:{provide(name:string,value:unknown):void}){writer.provide('page',{})}}
const other = {name:'other',apply(x:{on(name:string,f:()=>void):void}){x.on('ordinary/event',()=>{})}}
const unknown = {name:'unconfirmed',apply(ctx){ctx.provide('unconfirmed',{})}}
const typed: Plugin = {name:'typed',apply(ctx){ctx.provide('typedService',{})}}
const registered = {name:'registered',apply(ctx){ctx.provide('registeredService',{})}}
export function install(ctx:C){ctx.plugin(registered)}
export const explicit = plugin({name:'explicit-ordinary',apply(writer:{provide(name:string,value:unknown):void}){writer.provide('alsoOrdinary',{})}})
`)
    expect(result.facts.filter(f => f.kind === 'plugin').map(f => f.key)).toEqual([
      'explicit-ordinary',
      'registered',
      'typed',
    ])
    expect(result.facts.filter(f => f.kind === 'provides').map(f => f.key)).toEqual([
      'registeredService',
      'typedService',
    ])
    expect(result.facts.some(f => f.kind === 'listens')).toBe(false)
    expect(result.unknown.filter(item => item.kind === 'plugin')).toHaveLength(3)
    expect(result.serviceIdentifiers).toEqual({ attempted: 2, unresolved: 0, rate: 0 })
  })
  it('reads computed augmentation keys, inherited events, native class plugins and const apply exports', () => {
    const result = extract(`${prelude}
/** @owner packages/core/example */
export abstract class Base extends Service { static readonly provide = 'registry' }
const KEY = Base.provide
interface ParentEvents {
  /** @mode serial */
  'example/control'(): void
}
declare module '@deepseek-ai/cordis' {
  interface Context { [KEY]: Base }
  interface Events extends ParentEvents {}
}
export class ClassPlugin {
  static readonly name = 'class-plugin'
  static readonly inject = ['registry']
  constructor(ctx: C) { ctx.get('registry'); ctx.provide('classService', {}) }
}
export const name = 'const-apply'
export const inject = ['registry']
export const apply = (ctx: C) => ctx.provide('constService', {})
`)
    expect(
      result.facts
        .filter(f => f.kind === 'defines' && f.key === 'registry')
        .map(f => f.definitionForm)
        .sort(),
    ).toEqual(['context-augmentation', 'service-class'])
    expect(result.facts.find(f => f.kind === 'event-declaration')).toMatchObject({
      key: 'example/control',
      mode: 'serial',
    })
    expect(
      result.facts.find(f => f.plugin === 'class-plugin' && f.kind === 'provides'),
    ).toMatchObject({ key: 'classService', provideForm: 'ctx.provide' })
    expect(
      result.facts.find(f => f.plugin === 'const-apply' && f.kind === 'provides'),
    ).toMatchObject({ key: 'constService' })
    expect(
      result.facts.find(f => f.plugin === 'class-plugin' && f.kind === 'injects'),
    ).toMatchObject({ injectExpression: "['registry']", injectShape: 'ArrayLiteralExpression' })
    expect(result.facts.some(f => f.kind === 'optional')).toBe(false)
  })
})
