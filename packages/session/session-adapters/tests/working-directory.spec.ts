import { describe, expect, it } from 'vitest'
import { workspaceCodec, type WorkspaceId } from '@omne-harness/legal-identity'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import {
  deriveSessionOperation,
  type DeclarationChange,
  type SessionId,
} from '@omne-harness/session-contract'
import { heldBlock } from '../src/cordis/context-records.ts'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import { SESSION_WORKING_DIRECTORY } from '../src/working-directory-schema.ts'
import type { WorkingDirectory } from '../src/working-directory-schema.ts'
import {
  contextStepCommit,
  decodeStep,
  encodeContextRegistrationChange,
  encodeInitialContextRegistration,
  type SessionContextDefinitions,
} from '../src/cordis/context-input.ts'
import {
  workingDirectoryBindings,
  workingDirectoryCallBinding,
  workingDirectoryDescriptor,
  workingDirectoryModelBinding,
} from '../src/cordis/working-directory-block.ts'
import {
  workingDirectoryCommand,
  workingDirectoryStep,
} from '../src/cordis/working-directory-commit.ts'
import {
  createStepDirectory,
  type StepDirectoryInput,
  type WorkingDirectoryTargets,
} from '../src/cordis/working-directory-step.ts'

type Check = Awaited<ReturnType<WorkingDirectoryTargets<string>['check']>>
type Snapshot = StepDirectoryInput<string>['snapshot']
type Records = NonNullable<Snapshot['contextRecords']>

const access = memoryAccess('directory-a')
const DEFAULT = '/srv/default'
const KEY = workingDirectoryDescriptor.key
const EVIDENCE = { owner: 'test', record: 'registration', revision: '1', digest: 'sha256:0' }

function workspace(index: number): WorkspaceId {
  const parsed = workspaceCodec.parse(`wsp_${String(index).padStart(26, '0')}`)
  if (!parsed.ok) throw new Error('invalid workspace')
  return parsed.value
}
const textOf = (id: WorkspaceId) => (workspaceCodec.encode(id) as { value: string }).value
const blog = { workspace: workspace(1), instance: 'wsi_blog' }
const shop = { workspace: workspace(2), instance: 'wsi_shop' }
const attached = (at: typeof blog, directory: string): WorkingDirectory => ({
  state: 'attached',
  workspace: textOf(at.workspace),
  instance: at.instance,
  directory,
})

function scopeOf(ref: string): ScopeRef {
  const scope = decodeScopeRef({ ref })
  if ('failure' in scope) throw new Error('invalid scope')
  return scope.ok
}
const SCOPE = scopeOf('directory-scope-a')
/** A session revision for the commit of a step: tests name it after the step or give a number. */
const revisionOf = (value: number | string) => String(value) as never

const definitions: SessionContextDefinitions = {
  binding: ref =>
    workingDirectoryBindings.find(item => item.need.name === ref.need && item.key === ref.key),
  declaration: ref => (ref.key === KEY ? workingDirectoryDescriptor : undefined),
}

/** The registration a session log holds for the block: with its declaration, or as runs 1 and 2 left it. */
function registration(declared: boolean): Records[number] {
  const encoded = encodeInitialContextRegistration(
    {
      definition: SESSION_WORKING_DIRECTORY,
      key: KEY,
      bindings: workingDirectoryBindings,
      parameters: undefined,
      ...(declared ? { declaration: workingDirectoryDescriptor } : {}),
    },
    definitions,
  )
  if ('failure' in encoded) throw new Error(encoded.failure)
  const declaration: DeclarationChange = {
    kind: 'context-registration',
    registration: EVIDENCE,
    ...encoded.ok,
  }
  return { scope: SCOPE.ref, declaration }
}

/** A later registration of the block in the scope: its bindings again, or its removal. */
function changed(kind: 'update' | 'remove'): Records[number] {
  const head = { scope: SCOPE, tenant: access.tenant, key: KEY, basedOn: 1, creating: false }
  const change =
    kind === 'update'
      ? { ...head, kind, bindings: [...workingDirectoryBindings], parameters: undefined }
      : { ...head, kind }
  const encoded = encodeContextRegistrationChange(
    { change, definition: SESSION_WORKING_DIRECTORY, operation: `op-${kind}` as never },
    definitions,
  )
  if ('failure' in encoded) throw new Error(encoded.failure)
  return {
    scope: SCOPE.ref,
    declaration: { kind: 'context-registration', registration: EVIDENCE, ...encoded.ok },
  }
}

function committed(step: string, value: WorkingDirectory): Records[number] {
  const command = workingDirectoryCommand({
    ...access,
    scope: SCOPE,
    step,
    at: revisionOf(step),
    value,
  })
  return { scope: SCOPE.ref, declaration: command.input.declaration }
}

/** A session that stands at `selected`, with the context records its log holds. */
function standing(
  selected: Readonly<{ workspace: WorkspaceId; instance: string }> | null,
  contextRecords: Records,
): Snapshot {
  const attachment = selected === null ? null : { instance: selected.instance, basis: 'unpinned' }
  return {
    creation: { workspace: selected?.workspace ?? null, workspaceAttachment: attachment },
    changes: [],
    contextRecords,
  } as unknown as Snapshot
}

function boundary(
  check: () => Check | Promise<Check> = () => ({ kind: 'unavailable' }),
  recovered: 'ready' | 'absent' | 'unavailable' = 'ready',
) {
  const asked: unknown[] = []
  const step = createStepDirectory<string>({
    defaultDirectory: DEFAULT,
    targets: () => ({
      check: async input => {
        asked.push(input)
        return check()
      },
    }),
    recover: async () => ({ kind: recovered }),
  })
  const at = (snapshot: Snapshot) => step.refresh({ ...access, scope: SCOPE, snapshot })
  return { at, asked }
}

describe('the working directory decided at a step boundary', () => {
  const HELD = [registration(true)]

  it.each<[string, Check, WorkingDirectory]>([
    [
      'the root of the instance when the workspace owner says it can be attached',
      { kind: 'attachable', directory: '/srv/blog' },
      attached(blog, '/srv/blog'),
    ],
    [
      'selected but unusable, with the reason, when the tenant is not permitted',
      { kind: 'refused', reason: 'not-permitted' },
      {
        state: 'unusable',
        workspace: textOf(blog.workspace),
        instance: 'wsi_blog',
        reason: 'not-permitted',
      },
    ],
    [
      'selected but unusable, with the reason, when the instance is not there',
      { kind: 'refused', reason: 'instance-unavailable' },
      {
        state: 'unusable',
        workspace: textOf(blog.workspace),
        instance: 'wsi_blog',
        reason: 'instance-unavailable',
      },
    ],
  ])('commits %s when the block holds no value yet', async (_name, answer, value) => {
    const b = boundary(() => answer)
    expect(await b.at(standing(blog, HELD))).toEqual({ kind: 'commit', value })
    const { principal, tenant } = access
    expect(b.asked).toEqual([{ principal, tenant, ...blog }])
  })

  it('commits the server default, asked of nobody, when the session selected no workspace', async () => {
    const b = boundary()
    expect(await b.at(standing(null, HELD))).toEqual({
      kind: 'commit',
      value: { state: 'default', directory: DEFAULT },
    })
    expect(b.asked).toEqual([])
  })

  it('commits nothing when the last commit of the scope holds the same value', async () => {
    const b = boundary(() => ({ kind: 'attachable', directory: '/srv/blog' }))
    const records = [...HELD, committed('step-1', attached(blog, '/srv/blog'))]
    expect(await b.at(standing(blog, records))).toEqual({ kind: 'refreshed' })
  })

  it('commits the new value when the selection changed since the last commit', async () => {
    const b = boundary(() => ({ kind: 'attachable', directory: '/srv/shop' }))
    const records = [...HELD, committed('step-1', attached(blog, '/srv/blog'))]
    expect(await b.at(standing(shop, records))).toEqual({
      kind: 'commit',
      value: attached(shop, '/srv/shop'),
    })
  })

  it('reads the last commit of its own scope only', async () => {
    const b = boundary(() => ({ kind: 'attachable', directory: '/srv/blog' }))
    const other = { ...committed('step-1', attached(blog, '/srv/blog')), scope: 'another-scope' }
    expect(await b.at(standing(blog, [...HELD, other]))).toEqual({
      kind: 'commit',
      value: attached(blog, '/srv/blog'),
    })
  })

  it('commits nothing and asks nobody in a scope that never registered the block', async () => {
    const b = boundary(() => ({ kind: 'attachable', directory: '/srv/blog' }))
    expect(await b.at(standing(blog, []))).toEqual({ kind: 'refreshed' })
    expect(b.asked).toEqual([])
  })

  it('commits in a scope registered before the block was declared: recovery reads it as declared now', async () => {
    const b = boundary(() => ({ kind: 'attachable', directory: '/srv/blog' }))
    expect(await b.at(standing(blog, [registration(false)]))).toEqual({
      kind: 'commit',
      value: attached(blog, '/srv/blog'),
    })
  })

  it('keeps the committed value over a registration that updates the block, and holds none once it is removed', async () => {
    const b = boundary(() => ({ kind: 'attachable', directory: '/srv/blog' }))
    const records = [...HELD, committed('step-1', attached(blog, '/srv/blog')), changed('update')]
    expect(await b.at(standing(blog, records))).toEqual({ kind: 'refreshed' })
    expect(b.asked).toHaveLength(1)
    expect(await b.at(standing(blog, [...records, changed('remove')]))).toEqual({
      kind: 'refreshed',
    })
    expect(b.asked).toHaveLength(1)
  })

  it('fails the boundary when the owner cannot verify, or throws, and commits nothing', async () => {
    let answer: Check | Error = { kind: 'unavailable' }
    const b = boundary(() => {
      if (answer instanceof Error) throw answer
      return answer
    })
    expect(await b.at(standing(blog, HELD))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the workspace owner could not verify the selected instance',
    })
    answer = new Error('the owner threw')
    expect(await b.at(standing(blog, HELD))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the working directory refresh threw: Error: the owner threw',
    })
  })

  it('fails the boundary when the scope of the session cannot be restored', async () => {
    for (const recovered of ['absent', 'unavailable'] as const)
      expect(await boundary(undefined, recovered).at(standing(null, HELD))).toEqual({
        kind: 'unavailable',
        diagnostic: `the context scope of the session is ${recovered}`,
      })
  })

  it('fails the boundary when the workspace owner is not installed', async () => {
    const step = createStepDirectory<string>({
      defaultDirectory: DEFAULT,
      targets: () => undefined,
      recover: async () => ({ kind: 'ready' }),
    })
    expect(await step.refresh({ ...access, scope: SCOPE, snapshot: standing(blog, HELD) })).toEqual(
      {
        kind: 'unavailable',
        diagnostic: 'the workspace owner is not installed',
      },
    )
  })
})

async function holder() {
  const trust = createTestAuthorityPorts<string>()
  const runtime = createRuntimeContext({
    trust: { authority: trust.authority, bindings: trust.bindings },
  })
  trust.bind(SCOPE, access.tenant)
  const registered = {
    commit: { commit: 'directory-registration' },
    change: {
      kind: 'add' as const,
      creating: true,
      scope: SCOPE,
      tenant: access.tenant,
      key: KEY,
      basedOn: 0,
      required: true,
      parameters: undefined,
      bindings: [...workingDirectoryBindings],
      declaration: workingDirectoryDescriptor,
    },
  }
  /** The holder restores the scope from what the session log holds, as a starting process does. */
  async function restore(checkpoint: Readonly<{ step: string; value: WorkingDirectory }> | null) {
    const step = checkpoint === null ? null : stepOf(checkpoint.step, checkpoint.value)
    const begun = await runtime.beginReplay('holder', {
      scope: SCOPE,
      tenant: access.tenant,
      through: step?.commit ?? registered.commit,
      supersedes: null,
    })
    if (begun.kind !== 'replaying') throw new Error(JSON.stringify(begun))
    const finished = await runtime.finishReplay('holder', {
      replay: begun.replay,
      material: {
        registrations: [registered],
        checkpoints:
          step === null
            ? []
            : [
                {
                  commit: step.commit,
                  step: step.stepCommit.step,
                  blocks: [{ key: KEY, value: checkpoint!.value, updates: [] }],
                },
              ],
        end: null,
      },
    })
    if (finished.kind !== 'ready') throw new Error(JSON.stringify(finished))
  }
  async function apply(step: string, value: WorkingDirectory, after: { commit: string }) {
    const made = stepOf(step, value)
    return runtime.applyCommit('holder', {
      kind: 'step',
      commit: made.commit,
      after,
      tenant: access.tenant,
      stepCommit: made.stepCommit,
      executionEnded: false,
    })
  }
  async function read() {
    const issued = await runtime.issueEligibility('holder', {
      supersedes: null,
      scope: SCOPE,
      tenant: access.tenant,
      consumer: 'coordinator',
      principal: access.principal,
      keys: [KEY],
      bindings: [],
      registrationRevision: 1,
    })
    if (issued.kind !== 'issued') throw new Error(JSON.stringify(issued))
    const bound = await runtime.bind(issued.eligibility.id)
    if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
    try {
      const result = await bound.reader.read([
        { need: workingDirectoryCallBinding.need.name, key: KEY },
      ])
      if (result.kind === 'missing') return `missing:${String(result.items[0]?.cause)}`
      if (result.kind !== 'success') return result.kind
      const [item] = result.value
      return item?.kind === 'value' ? item.value : item?.kind
    } finally {
      await bound.reader.end()
    }
  }
  return { runtime, restore, apply, read, registered }
}

function stepOf(step: string, value: WorkingDirectory) {
  const made = workingDirectoryStep({ ...access, scope: SCOPE, step, at: revisionOf(step), value })
  return { ...made, commit: contextStepCommit({ scope: SCOPE, operation: made.operation }) }
}

describe('the commit of a boundary in the holder (C1)', () => {
  it('is accepted from the coordinator, and the block reads its value', async () => {
    const h = await holder()
    try {
      await h.restore(null)
      expect(await h.read()).toBe('missing:no-value')
      const applied = await h.apply('step-1', attached(blog, '/srv/blog'), h.registered.commit)
      expect(applied.kind).toBe('applied')
      expect(await h.read()).toEqual(attached(blog, '/srv/blog'))
    } finally {
      await h.runtime.close()
    }
  })

  it('a rebuilt process reads the value of the last commit, not the selection made since', async () => {
    // The model's bad-recover-latest: recovery that takes the newest selection breaks ToldDirectory.
    const h = await holder()
    try {
      await h.restore({ step: 'step-1', value: attached(blog, '/srv/blog') })
      expect(await h.read()).toEqual(attached(blog, '/srv/blog'))
    } finally {
      await h.runtime.close()
    }
  })

  it('derives one operation for one value on one session revision, and another for anything else', () => {
    const at = (revision: number, value = attached(blog, '/a'), step = 'step-1') =>
      workingDirectoryStep({ ...access, scope: SCOPE, step, at: revisionOf(revision), value })
        .operation
    // An answer that was lost is taken back by the same operation on the same revision.
    expect(at(4)).toBe(at(4))
    expect(at(4, attached(blog, '/b'))).not.toBe(at(4))
    // Step numbers start again in each execution: a later run's first step is another boundary.
    expect(at(9)).not.toBe(at(4))
    const elsewhere = workingDirectoryStep({
      ...access,
      session: 'another-session' as SessionId,
      scope: SCOPE,
      step: 'step-1',
      at: revisionOf(4),
      value: attached(blog, '/a'),
    })
    expect(elsewhere.operation).not.toBe(at(4))
  })
})

describe('what the session log holds of the block', () => {
  const other = (records: Records[number]): Records[number] => {
    const text = JSON.stringify(records).replaceAll(KEY, 'session.other-block')
    return JSON.parse(text) as Records[number]
  }

  it('holds the block of its own key only, and its last commit only', () => {
    const value = attached(blog, '/srv/blog')
    expect(heldBlock([registration(true)], SCOPE, KEY)).toEqual({ kind: 'held', committed: null })
    expect(heldBlock([other(registration(true))], SCOPE, KEY)).toEqual({ kind: 'not-held' })
    const records = [registration(true), committed('step-1', value)]
    expect(
      heldBlock([...records, other(committed('step-2', attached(shop, '/x')))], SCOPE, KEY),
    ).toEqual({
      kind: 'held',
      committed: { value },
    })
    expect(heldBlock([...records, other(registration(false))], SCOPE, KEY)).toEqual({
      kind: 'held',
      committed: { value },
    })
  })

  it('commits the value at the boundary of a session whose log has no context records yet', async () => {
    const b = boundary()
    const none = { creation: { workspace: null, workspaceAttachment: null }, changes: [] } as never
    expect(await b.at(none)).toEqual({ kind: 'refreshed' })
  })
})

describe('the step commit a boundary writes', () => {
  it('is the coordinator writing the whole value, at a revision, with its basis, not ending the execution', () => {
    const value = attached(blog, '/srv/blog')
    const command = workingDirectoryCommand({
      ...access,
      scope: SCOPE,
      step: 'step-3',
      at: revisionOf(7),
      value,
    })
    const operation = deriveSessionOperation({
      kind: 'context-step',
      session: access.session,
      scope: SCOPE.ref,
      at: '7',
      value:
        command.input.declaration.kind === 'context-step-commit'
          ? command.input.declaration.basis.digest
          : '',
    })
    expect(command.input.expected).toBe(revisionOf(7))
    expect(command.input.operation).toBe(operation)
    const { declaration } = command.input
    if (declaration.kind !== 'context-step-commit') throw new Error(declaration.kind)
    expect(declaration.basis.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    const step = decodeStep(declaration.updates)
    expect(step.commit).toEqual(contextStepCommit({ scope: SCOPE, operation }))
    expect(step.executionEnded).toBe(false)
    expect(step.stepCommit.step).toEqual({ step: 'step-3' })
    expect(step.stepCommit.committed).toEqual([
      {
        key: KEY,
        value,
        updates: [
          {
            origin: { origin: expect.any(String) },
            key: KEY,
            update: value,
            writer: 'coordinator',
          },
        ],
      },
    ])
  })
})

describe('the declaration of the working directory block', () => {
  it('is a required stateful block the coordinator writes at step boundaries, checkpointed', () => {
    expect(workingDirectoryDescriptor).toMatchObject({
      key: 'session.working-directory',
      consumers: ['model', 'coordinator', 'extension'],
      required: true,
      disclosure: 'eligibility-checked',
      carriesPrevious: true,
      volatility: 'per-step',
      kind: 'stateful',
      writers: ['coordinator'],
      persistence: 'checkpointed',
      singleWriterPerStep: true,
    })
    const value = attached(blog, '/srv/blog')
    expect(workingDirectoryDescriptor.reduce(undefined, value)).toEqual(value)
    expect(() => workingDirectoryDescriptor.reduce(undefined, { state: 'elsewhere' })).toThrow()
    expect(workingDirectoryBindings).toEqual([
      workingDirectoryModelBinding,
      workingDirectoryCallBinding,
    ])
  })
})
