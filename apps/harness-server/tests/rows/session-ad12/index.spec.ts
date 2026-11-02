// @module-tag slow
// The `session-ad12` row: the real Context input of Session over the assembly's adopted
// definitions. The row is ACTIVE and provides `sessionContextInput` on a `runtimeContext`
// provider, and stays PENDING naming the key without one. A `create` with no registration source
// has nothing to restore and gets an empty material list; a `create` whose source references a
// block that no adopted definition declares is `invalid`, not restored from somewhere else. A
// registration `change` needs the coordinator principal, which this assembly has no source for:
// the row answers `unavailable` and names the port instead of signing a principal itself.
// Slow: it loads a Cordis tree per case.
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeScopeRef,
  type ContextBlockKey,
  type NeedBinding,
  type RegistrationChange,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  encodeContextRegistrationChange,
  encodeInitialContextRegistration,
} from '@omne-harness/session-adapters/cordis'
import type {
  Adoption,
  InitializationSource,
  SessionAccess,
  SessionCommand,
} from '@omne-harness/session-contract'
import {
  adoption,
  creation,
  evidence,
  memoryAccess,
  operationId,
} from '@omne-harness/session-contract/testing'
import {
  sessionContextInputKey,
  type SessionContextInputService,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  adoptedContextDefinitions,
  createContextDefinitions,
} from '../../../src/assembly/context-definitions.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { sessionAd12Row } from '../../../src/rows/session-ad12/index.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'
import { runtimeContextDoubleRow } from './support.ts'

const access: SessionAccess<unknown> = memoryAccess('caller')

const numberShape = {
  '~standard': {
    version: 1 as const,
    vendor: 'session-ad12-spec',
    validate: (value: unknown) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
  },
}
const NOTES: ContextBlockKey = 'test.notes'
/** A definition nobody adopted, with one binding, so that materials can be encoded against it. */
const foreign: Adoption = adoption('foreign-definition')
const notesNeed: NeedBinding = {
  key: NOTES,
  need: {
    name: 'notes',
    shape: numberShape,
    consumer: 'model',
    purpose: 'test',
    necessity: 'optional',
  },
}
const foreignDefinitions = createContextDefinitions([
  { definition: foreign, bindings: [notesNeed], declarations: [] },
])

function scopeRef(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('fixture: scope')
  return decoded.ok
}

function createCommand(name: string, sources: readonly InitializationSource[] = []) {
  const command: Extract<SessionCommand, { kind: 'create' }> = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId(name),
      creation: creation(sources.length === 0 ? {} : { initialization: { sources, results: [] } }),
    },
  }
  return command
}

/** A `create` whose one source is a registration of the foreign definition's binding. */
function createWithForeignRegistration() {
  const encoded = encodeInitialContextRegistration(
    { definition: foreign, key: NOTES, bindings: [notesNeed], parameters: undefined },
    foreignDefinitions,
  )
  if ('failure' in encoded) throw new Error(`fixture: ${encoded.failure}`)
  return createCommand('create-foreign', [
    {
      item: 'notes',
      owner: 'test',
      protocol: adoption('test-source'),
      kind: 'context-registration',
      input: encoded.ok,
    },
  ])
}

/** A `change` that removes a block: it carries no binding and no declaration, so it encodes. */
function removeCommand(name: string) {
  const scope = scopeRef('session-scope:ad12')
  const change: RegistrationChange = {
    kind: 'remove',
    scope,
    tenant: access.tenant,
    key: NOTES,
    basedOn: 1,
    creating: false,
  }
  const encoded = encodeContextRegistrationChange(
    { change, definition: foreign, operation: operationId(name) },
    adoptedContextDefinitions,
  )
  if ('failure' in encoded) throw new Error(`fixture: ${encoded.failure}`)
  const command: Extract<SessionCommand, { kind: 'change' }> = {
    kind: 'change',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId(name),
      declaration: {
        kind: 'context-registration',
        registration: evidence(`registration/${name}`),
        ...encoded.ok,
      },
    },
  }
  return command
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(options: { runtimeContext: boolean }): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const tree = await loadTree({
    base,
    rows: [
      ...(options.runtimeContext ? [runtimeContextDoubleRow()] : []),
      declared(sessionAd12Row),
    ],
    readinessTimeoutMs: options.runtimeContext ? 10_000 : 2000,
  })
  release.push(() => tree.dispose())
  return tree
}

function inputOf(tree: LoadedTree): SessionContextInputService<unknown> {
  const service = tree.service<SessionContextInputService<unknown>>(sessionContextInputKey)
  if (service === undefined) throw new Error('the row provides no sessionContextInput')
  return service
}

describe('the session-ad12 row: declaration', () => {
  it('is the real row: provides `sessionContextInput`, injects `runtimeContext`, no shutdown phase', () => {
    expect(rowDeclarationOf(sessionAd12Row)).toEqual({
      row: 'session-ad12',
      implementation: 'real',
      manifest: {
        provides: ['sessionContextInput'],
        injects: ['runtimeContext'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })
})

describe('the session-ad12 row: on a runtimeContext provider', () => {
  it('is ACTIVE and provides `sessionContextInput`', { timeout: 60_000 }, async () => {
    const tree = await start({ runtimeContext: true })
    expect(tree.allActive).toBe(true)
    expect(tree.state('session-ad12')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.service(sessionContextInputKey)).toBeDefined()
  })

  it(
    'a `create` with no registration source has nothing to restore: no material',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ runtimeContext: true })
      const answer = await inputOf(tree).prepare(access, createCommand('create-plain'))
      expect(answer).toEqual({ ok: [] })
    },
  )

  it(
    'a `create` that registers a block of a definition the release did not adopt is invalid, naming the source',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ runtimeContext: true })
      const answer = await inputOf(tree).prepare(access, createWithForeignRegistration())
      expect(answer).toMatchObject({
        failure: { kind: 'invalid', field: 'creation.initialization.sources[0]' },
      })
    },
  )

  it(
    'a registration `change` is unavailable: the assembly hands the row no coordinator principal source',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ runtimeContext: true })
      const answer = await inputOf(tree).prepare(access, removeCommand('remove-notes'))
      expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
      if (!('failure' in answer) || answer.failure.kind !== 'unavailable')
        throw new Error('unreachable')
      expect(answer.failure.diagnostic).toContain('coordinator principal')
    },
  )

  it('without `runtimeContext` stays PENDING and names the key', { timeout: 60_000 }, async () => {
    const tree = await start({ runtimeContext: false })
    expect(tree.state('session-ad12')).toMatchObject({
      state: 'PENDING',
      missing: [runtimeContextKey],
    })
    expect(tree.service(sessionContextInputKey)).toBeUndefined()
  })
})
