import { expectTypeOf, test } from 'vitest'
import {
  defineProtocol,
  ruleCodec,
  type DefinedProtocol,
  type OperationContract,
  type ProtocolContract,
} from '@omne-harness/public-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const note = ruleCodec({ kind: 'object', fields: { title: { rule: { kind: 'text' } } } })

const protocol = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    open: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: note },
    },
    read: {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: note, 'not-found': empty },
    },
    save: {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'input',
      body: note,
      outcomes: { succeeded: empty, conflict: empty },
      countsAsAccess: true,
    },
  },
  observations: {
    watch: { identity: 'login', open: empty, frame: note, ends: ['archived'] },
  },
})

test('each operation lists the outcomes the pipeline answers', () => {
  type Names<N extends keyof typeof protocol.operations> =
    keyof (typeof protocol.operations)[N]['outcomes']
  expectTypeOf<Names<'open'>>().toEqualTypeOf<
    'succeeded' | 'protocol-rejected' | 'basis-unavailable'
  >()
  expectTypeOf<Names<'read'>>().toEqualTypeOf<
    'succeeded' | 'not-found' | 'protocol-rejected' | 'basis-unavailable' | 'denied'
  >()
  expectTypeOf<Names<'save'>>().toEqualTypeOf<
    'succeeded' | 'conflict' | 'protocol-rejected' | 'basis-unavailable' | 'denied' | 'unknown'
  >()
  expectTypeOf(protocol.operations.save.outcomes.unknown).toEqualTypeOf<true>()
  expectTypeOf(protocol.operations.save.body).toEqualTypeOf(note)
  expectTypeOf(protocol.operations.save.effect).toEqualTypeOf<'commit'>()
})

test('an observation keeps only its own end reasons', () => {
  expectTypeOf(protocol.observations.watch.ends).toEqualTypeOf<readonly ['archived']>()
})

test('an operation whose effect may be commit gets unknown', () => {
  type Either = OperationContract & {
    readonly identity: 'none'
    readonly effect: 'read' | 'commit'
  }
  type Defined = DefinedProtocol<{
    readonly name: 'n'
    readonly major: 1
    readonly operations: { readonly op: Either }
    readonly observations: {}
  }>
  expectTypeOf<'unknown'>().toExtend<keyof Defined['operations']['op']['outcomes']>()
  expectTypeOf<Defined>().toExtend<ProtocolContract>()
})

test('an operation named observe does not compile', () => {
  const base = { identity: 'login', effect: 'read', limit: 'small', body: empty } as const
  defineProtocol({
    name: 'n',
    major: 1,
    // @ts-expect-error A client keeps its observations under `observe`; no operation may take the name.
    operations: { observe: { ...base, outcomes: { succeeded: empty } } },
    observations: {},
  })
})

test('a contract that breaks the outcome table does not compile', () => {
  const base = { identity: 'login', effect: 'read', limit: 'small', body: empty } as const
  defineProtocol({
    name: 'n',
    major: 1,
    // @ts-expect-error `denied` always has an empty body; a domain cannot give it a codec.
    operations: { a: { ...base, outcomes: { succeeded: empty, denied: note } } },
    observations: {},
  })
  defineProtocol({
    name: 'n',
    major: 1,
    // @ts-expect-error `unknown` is fixed as well.
    operations: { a: { ...base, outcomes: { succeeded: empty, unknown: note } } },
    observations: {},
  })
  defineProtocol({
    name: 'n',
    major: 1,
    // @ts-expect-error The outcome table is closed: `gone` is not an outcome.
    operations: { a: { ...base, outcomes: { succeeded: empty, gone: empty } } },
    observations: {},
  })
  defineProtocol({
    name: 'n',
    major: 1,
    // @ts-expect-error Every operation answers `succeeded`.
    operations: { a: { ...base, outcomes: { conflict: empty } } },
    observations: {},
  })
  defineProtocol({
    name: 'n',
    major: 1,
    // @ts-expect-error An operation has no field outside the contract.
    operations: { a: { ...base, outcomes: { succeeded: empty }, admin: true } },
    observations: {},
  })
  defineProtocol({
    name: 'n',
    major: 1,
    // @ts-expect-error `effect` is `read` or `commit`.
    operations: { a: { ...base, effect: 'write', outcomes: { succeeded: empty } } },
    observations: {},
  })
  defineProtocol({
    name: 'n',
    major: 1,
    operations: {},
    // @ts-expect-error An observation has no field outside the contract.
    observations: { w: { identity: 'none', open: empty, frame: note, ends: [], retry: true } },
  })
})
