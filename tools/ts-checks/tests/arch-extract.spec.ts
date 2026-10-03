import { describe, expect, it } from 'vitest'
import { extractArchitecture } from '../src/arch/extract.ts'
import { snapshotOf } from '../src/arch/snapshot.ts'

const source = 'packages/session/example/src/plugin.ts'
function extract(text: string, extra: Record<string, string> = {}) {
  return extractArchitecture(
    snapshotOf(
      new Map(
        Object.entries({
          'packages/session/example/package.json':
            '{"name":"@omne-harness-lite/example","exports":{".":"./dist/index.js"}}',
          [source]: text,
          ...extra,
        }),
      ),
    ),
  )
}
const prelude = `import { definePlugin as plugin } from '@omne-harness-lite/kernel-basis'
import { Context as C, Service } from '@deepseek-ai/cordis'
`

describe('static architecture extraction', () => {
  it('resolves workspace public re-exports, aliases and static class keys without merging plugins', () => {
    const result = extract(
      `${prelude}
import { KEY as storage } from '@omne-harness-lite/keys'
export const a = plugin({ name: 'a', inject: [storage], apply(ctx) {
  ctx.get(storage); ctx.get('clock'); ctx.provide('alpha', {});
  const ordinary = { get() {}, on() {}, provide() {} }; ordinary.get('fake'); ordinary.on('fake'); ordinary.provide('fake');
}})
export const b = plugin({ name: 'b', apply(ctx) { ctx.get(storage); ctx.provide('beta', {}) } })
`,
      {
        'packages/core/keys/package.json':
          '{"name":"@omne-harness-lite/keys","exports":{".":"./dist/index.js"}}',
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
          "import { exported as local, type Other } from '@omne-harness-lite/example'; export function build(){return [{name:'entry',plugin:local,config:factory()}]}",
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
