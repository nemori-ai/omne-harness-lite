import { describe, expect, it } from 'vitest'
import { workspaceCodec, type WorkspaceId } from '@omne-harness/legal-identity'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { memoryAccess, memoryOtherAccess } from '@omne-harness/session-contract/testing'
import {
  workingDirectoryBindings,
  workingDirectoryCallBinding,
  workingDirectoryDescriptor,
  workingDirectoryModelBinding,
  workingDirectoryProducer,
} from '../src/cordis/working-directory-block.ts'
import {
  createWorkingDirectoryPublisher,
  createWorkingDirectoryPublishers,
} from '../src/cordis/working-directory-publisher.ts'
import {
  createStepDirectory,
  type StepDirectoryInput,
  type WorkingDirectoryTargets,
} from '../src/cordis/working-directory-step.ts'

type Check = Awaited<ReturnType<WorkingDirectoryTargets<string>['check']>>
type Snapshot = StepDirectoryInput<string>['snapshot']

const access = memoryAccess('directory-a')
const DEFAULT = '/srv/default'
const NEED = {
  need: 'session.working-directory-for-calls',
  key: 'session.working-directory',
} as const

function workspace(index: number): WorkspaceId {
  const parsed = workspaceCodec.parse(`wsp_${String(index).padStart(26, '0')}`)
  if (!parsed.ok) throw new Error('invalid workspace')
  return parsed.value
}
const textOf = (id: WorkspaceId) => (workspaceCodec.encode(id) as { value: string }).value

/** A session that stands at `selected`: created with it, or changed to it last. */
function standing(selected: Readonly<{ workspace: WorkspaceId; instance: string }> | null) {
  const attachment = selected === null ? null : { instance: selected.instance, basis: 'unpinned' }
  return {
    creation: { workspace: selected?.workspace ?? null, workspaceAttachment: attachment },
    changes: [],
  } as unknown as Snapshot
}

function scopeOf(ref: string): ScopeRef {
  const scope = decodeScopeRef({ ref })
  if ('failure' in scope) throw new Error('invalid scope')
  return scope.ok
}

async function world() {
  const trust = createTestAuthorityPorts<string>()
  const runtime = createRuntimeContext({
    trust: { authority: trust.authority, bindings: trust.bindings },
  })
  const scope = scopeOf('directory-scope-a')
  const commit = { commit: 'directory-registration' }
  const change = {
    kind: 'add' as const,
    creating: true,
    scope,
    tenant: access.tenant,
    key: 'session.working-directory' as const,
    basedOn: 0,
    required: true,
    parameters: undefined,
    bindings: [...workingDirectoryBindings],
  }
  let replay: { replay: string } | null = null
  /** The holder restores the scope from the session log, as it does when a process starts. */
  async function restore(registered: boolean) {
    const begun = await runtime.beginReplay('holder', {
      scope,
      tenant: access.tenant,
      through: registered ? commit : null,
      supersedes: replay,
    })
    if (begun.kind !== 'replaying') throw new Error(JSON.stringify(begun))
    replay = begun.replay
    const finished = await runtime.finishReplay('holder', {
      replay: begun.replay,
      material: {
        registrations: registered ? [{ commit, change }] : [],
        checkpoints: [],
        end: null,
      },
    })
    if (finished.kind !== 'ready') throw new Error(JSON.stringify(finished))
  }
  async function read() {
    const issued = await runtime.issueEligibility('holder', {
      supersedes: null,
      scope,
      tenant: access.tenant,
      consumer: 'coordinator',
      principal: access.principal,
      keys: [NEED.key],
      bindings: [],
      registrationRevision: 1,
    })
    if (issued.kind !== 'issued') throw new Error(JSON.stringify(issued))
    const bound = await runtime.bind(issued.eligibility.id)
    if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
    try {
      const result = await bound.reader.read([NEED])
      if (result.kind === 'missing') return `missing:${String(result.items[0]?.cause)}`
      if (result.kind !== 'success') return result.kind
      const [item] = result.value
      return item?.kind === 'value' ? item.value : item?.kind
    } finally {
      await bound.reader.end()
    }
  }
  trust.bind(scope, access.tenant)
  return { runtime, scope, restore, read }
}

/** One process: its publisher and the step action that drives it. */
function process(
  runtime: Awaited<ReturnType<typeof world>>['runtime'],
  check: () => Check | Promise<Check> = () => ({ kind: 'unavailable' }),
) {
  const publisher = createWorkingDirectoryPublisher<string>({
    tenant: access.tenant,
    principal: 'producer',
    runtime,
  })
  const asked: unknown[] = []
  const step = createStepDirectory<string>({
    defaultDirectory: DEFAULT,
    targets: () => ({
      check: async input => {
        asked.push(input)
        return check()
      },
    }),
    recover: async () => ({ kind: 'ready' }),
    publish: (_tenant, scope, value) => publisher.publish(scope, value),
  })
  const boundary = (scope: ScopeRef, snapshot: Snapshot) =>
    step.refresh({ ...access, scope, snapshot })
  return { publisher, boundary, asked }
}

describe('the working directory in force at a step boundary', () => {
  const blog = { workspace: workspace(1), instance: 'wsi_blog' }

  it.each<[string, Check, unknown]>([
    [
      'the root of the instance when the workspace owner says it can be attached',
      { kind: 'attachable', directory: '/srv/blog' },
      {
        state: 'attached',
        workspace: textOf(blog.workspace),
        instance: 'wsi_blog',
        directory: '/srv/blog',
      },
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
  ])('is %s', async (_name, answer, value) => {
    const w = await world()
    const p = process(w.runtime, () => answer)
    try {
      await w.restore(true)
      expect(await p.boundary(w.scope, standing(blog))).toEqual({ kind: 'refreshed' })
      expect(await w.read()).toEqual(value)
      const { principal, tenant } = access
      expect(p.asked).toEqual([{ principal, tenant, ...blog }])
    } finally {
      await p.publisher.close()
      await w.runtime.close()
    }
  })

  it('is the server default, asked of nobody, when the session selected no workspace', async () => {
    const w = await world()
    const p = process(w.runtime)
    try {
      await w.restore(true)
      expect(await p.boundary(w.scope, standing(null))).toEqual({ kind: 'refreshed' })
      expect(await w.read()).toEqual({ state: 'default', directory: DEFAULT })
      expect(p.asked).toEqual([])
    } finally {
      await p.publisher.close()
      await w.runtime.close()
    }
  })

  it('fails the boundary and keeps the value of the step before when the owner cannot verify', async () => {
    const w = await world()
    let answer: Check | Error = { kind: 'attachable', directory: '/srv/blog' }
    const p = process(w.runtime, () => {
      if (answer instanceof Error) throw answer
      return answer
    })
    try {
      await w.restore(true)
      await p.boundary(w.scope, standing(blog))
      const before = await w.read()
      answer = { kind: 'unavailable' }
      expect(await p.boundary(w.scope, standing(blog))).toEqual({
        kind: 'unavailable',
        diagnostic: 'the workspace owner could not verify the selected instance',
      })
      answer = new Error('the owner threw')
      expect(await p.boundary(w.scope, standing(blog))).toEqual({
        kind: 'unavailable',
        diagnostic: 'the working directory refresh threw: Error: the owner threw',
      })
      expect(await w.read()).toEqual(before)
    } finally {
      await p.publisher.close()
      await w.runtime.close()
    }
  })

  it('answers refreshed and publishes nothing in a scope that never registered the block', async () => {
    const w = await world()
    const p = process(w.runtime)
    try {
      await w.restore(false)
      expect(await p.boundary(w.scope, standing(null))).toEqual({ kind: 'refreshed' })
      expect(await p.publisher.publish(w.scope, { state: 'default', directory: DEFAULT })).toEqual({
        kind: 'unregistered',
      })
    } finally {
      await p.publisher.close()
      await w.runtime.close()
    }
  })
})

describe('the working directory block between boundaries (C9)', () => {
  const blog = { workspace: workspace(1), instance: 'wsi_blog' }
  const shop = { workspace: workspace(2), instance: 'wsi_shop' }
  const rooted = (instance: string): Check => ({
    kind: 'attachable',
    directory: `/srv/${instance.slice(4)}`,
  })

  it('keeps the value of this step after the selection changes; the next boundary changes it', async () => {
    const w = await world()
    let selected = blog
    const p = process(w.runtime, () => rooted(selected.instance))
    try {
      await w.restore(true)
      await p.boundary(w.scope, standing(blog))
      // The change is committed to the session log. No boundary has passed.
      selected = shop
      expect(await w.read()).toMatchObject({ directory: '/srv/blog' })
      await p.boundary(w.scope, standing(shop))
      expect(await w.read()).toMatchObject({ directory: '/srv/shop' })
    } finally {
      await p.publisher.close()
      await w.runtime.close()
    }
  })

  it('publishes a value once: a boundary that decides the same value adds no revision', async () => {
    const w = await world()
    const p = process(w.runtime, () => rooted('wsi_blog'))
    const published: unknown[] = []
    const counted = createWorkingDirectoryPublisher<string>({
      tenant: access.tenant,
      principal: 'producer',
      runtime: {
        registerProducer: async (principal, input) => {
          const registered = await w.runtime.registerProducer(principal, input)
          if (registered.kind !== 'registered') return registered
          const { handle } = registered
          return {
            kind: 'registered',
            handle: {
              ...handle,
              publish: input => {
                published.push(input.value)
                return handle.publish(input)
              },
            },
          }
        },
      },
    })
    try {
      await w.restore(true)
      const value = { state: 'default', directory: DEFAULT } as const
      expect(await counted.publish(w.scope, value)).toEqual({ kind: 'published' })
      expect(await counted.publish(w.scope, { ...value })).toEqual({ kind: 'published' })
      expect(published).toEqual([value])
      expect(await counted.publish(w.scope, { ...value, directory: '/srv/other' })).toEqual({
        kind: 'published',
      })
      expect(published).toHaveLength(2)
    } finally {
      await counted.close()
      await p.publisher.close()
      await w.runtime.close()
    }
  })

  it('has no value after the process is rebuilt until the next boundary: a reader gets a missing item', async () => {
    const w = await world()
    const first = process(w.runtime, () => rooted('wsi_blog'))
    await w.restore(true)
    await first.boundary(w.scope, standing(blog))
    expect(await w.read()).toMatchObject({ directory: '/srv/blog' })
    await first.publisher.close()

    // A new process: a new publisher, and the holder restores the scope from the session log.
    const second = process(w.runtime, () => rooted('wsi_blog'))
    try {
      expect(await second.publisher.start()).toHaveProperty('kind', 'registered')
      await w.restore(true)
      // Computing it from the latest selection here would pin calls to a directory nobody was told.
      expect(await w.read()).toBe('missing:source-unavailable')
      expect(second.asked).toEqual([])
      await second.boundary(w.scope, standing(blog))
      expect(await w.read()).toMatchObject({ directory: '/srv/blog' })
    } finally {
      await second.publisher.close()
      await w.runtime.close()
    }
  })

  it('supplies what the last boundary published when the holder restores the scope in the same process', async () => {
    const w = await world()
    const p = process(w.runtime, () => rooted('wsi_blog'))
    try {
      await w.restore(true)
      await p.boundary(w.scope, standing(blog))
      await w.restore(true)
      expect(await w.read()).toMatchObject({ state: 'attached', directory: '/srv/blog' })
      // The boundary after it decides the same value and has nothing to publish again.
      expect(await p.boundary(w.scope, standing(blog))).toEqual({ kind: 'refreshed' })
      expect(await w.read()).toMatchObject({ state: 'attached', directory: '/srv/blog' })
    } finally {
      await p.publisher.close()
      await w.runtime.close()
    }
  })

  it('supplies nothing to another tenant, and nothing once it is closed', async () => {
    const w = await world()
    let supply: ((input: never) => Promise<unknown>) | undefined
    const publisher = createWorkingDirectoryPublisher<string>({
      tenant: access.tenant,
      principal: 'producer',
      runtime: {
        registerProducer: (principal, input) => {
          supply = input.supply as never
          // A scoped producer is asked only when a reader finds the block restored without a value.
          expect(input).toMatchObject({
            key: 'session.working-directory',
            tenant: access.tenant,
            scoped: true,
            producer: workingDirectoryProducer,
            declaration: workingDirectoryDescriptor,
          })
          return w.runtime.registerProducer(principal, input)
        },
      },
    })
    try {
      await w.restore(true)
      await publisher.publish(w.scope, { state: 'default', directory: DEFAULT })
      const asking = (tenant: unknown) =>
        supply?.({ scope: w.scope, tenant, principal: 'p' } as never)
      expect(await asking(access.tenant)).toMatchObject({ kind: 'value' })
      expect(await asking(memoryOtherAccess('stranger').tenant)).toEqual({ kind: 'refused' })
      await publisher.close()
      expect(await asking(access.tenant)).toEqual({ kind: 'unavailable' })
      expect(await publisher.publish(w.scope, { state: 'default', directory: '/x' })).toEqual({
        kind: 'closed',
      })
      expect(await publisher.start()).toEqual({ kind: 'rejected', reason: 'closed' })
    } finally {
      await w.runtime.close()
    }
  })
})

describe('a boundary that cannot publish', () => {
  const value = { state: 'default', directory: DEFAULT } as const
  type Runtime = Parameters<typeof createWorkingDirectoryPublisher<string>>[0]['runtime']

  it.each([
    [
      'refused',
      { kind: 'refused', reason: 'unauthorized' },
      'the publication was refused: unauthorized',
    ],
    [
      'rejected before the scope is restored',
      { kind: 'rejected', reason: 'replay-incomplete' },
      'the publication was rejected: replay-incomplete',
    ],
    ['unknown', { kind: 'unknown', cause: 'authority' }, 'the publication was unknown'],
  ] as const)(
    'answers unavailable when the publication is %s',
    async (_name, answer, diagnostic) => {
      const w = await world()
      const runtime: Runtime = {
        registerProducer: async (principal, input) => {
          const registered = await w.runtime.registerProducer(principal, input)
          if (registered.kind !== 'registered') return registered
          return {
            kind: 'registered',
            handle: { ...registered.handle, publish: async () => answer as never },
          }
        },
      }
      const publisher = createWorkingDirectoryPublisher<string>({
        tenant: access.tenant,
        principal: 'producer',
        runtime,
      })
      try {
        await w.restore(true)
        expect(await publisher.publish(w.scope, value)).toEqual({ kind: 'unavailable', diagnostic })
        // Nothing was published, so nothing is supplied and the next boundary publishes again.
        expect(await w.read()).toBe('missing:source-unavailable')
      } finally {
        await publisher.close()
        await w.runtime.close()
      }
    },
  )

  it('answers unavailable when the producer cannot be registered, and registers again next time', async () => {
    const w = await world()
    let refuse = true
    let registrations = 0
    const publisher = createWorkingDirectoryPublisher<string>({
      tenant: access.tenant,
      principal: 'producer',
      runtime: {
        registerProducer: async (principal, input) => {
          registrations++
          return refuse
            ? { kind: 'unavailable', cause: 'authority' }
            : w.runtime.registerProducer(principal, input)
        },
      },
    })
    try {
      await w.restore(true)
      expect(await publisher.publish(w.scope, value)).toEqual({
        kind: 'unavailable',
        diagnostic: 'the producer registration is unavailable',
      })
      refuse = false
      expect(await publisher.publish(w.scope, value)).toEqual({ kind: 'published' })
      expect(await publisher.publish(w.scope, { ...value, directory: '/srv/next' })).toEqual({
        kind: 'published',
      })
      expect(registrations).toBe(2)
    } finally {
      await publisher.close()
      await w.runtime.close()
    }
  })

  it.each(['absent', 'unavailable'] as const)(
    'fails the boundary without asking anybody when the scope of the session is %s',
    async state => {
      const published: unknown[] = []
      const asked: unknown[] = []
      const step = createStepDirectory<string>({
        defaultDirectory: DEFAULT,
        targets: () => ({
          check: async input => {
            asked.push(input)
            return { kind: 'unavailable' }
          },
        }),
        recover: async () => ({ kind: state }),
        publish: async (...input) => {
          published.push(input)
          return { kind: 'published' }
        },
      })
      const blog = { workspace: workspace(1), instance: 'wsi_blog' }
      expect(
        await step.refresh({ ...access, scope: scopeOf('s'), snapshot: standing(blog) }),
      ).toEqual({
        kind: 'unavailable',
        diagnostic: `the context scope of the session is ${state}`,
      })
      expect([asked, published]).toEqual([[], []])
    },
  )

  it('fails the boundary when the workspace owner is not installed or the publisher has stopped', async () => {
    const blog = { workspace: workspace(1), instance: 'wsi_blog' }
    const input = { ...access, scope: scopeOf('s') }
    const recover = async () => ({ kind: 'ready' as const })
    const absent = createStepDirectory<string>({
      defaultDirectory: DEFAULT,
      targets: () => undefined,
      recover,
      publish: async () => ({ kind: 'published' }),
    })
    expect(await absent.refresh({ ...input, snapshot: standing(blog) })).toEqual({
      kind: 'unavailable',
      diagnostic: 'the workspace owner is not installed',
    })
    // With no workspace selected the owner is not needed.
    expect(await absent.refresh({ ...input, snapshot: standing(null) })).toEqual({
      kind: 'refreshed',
    })
    const stopped = createStepDirectory<string>({
      defaultDirectory: DEFAULT,
      targets: () => undefined,
      recover,
      publish: async () => ({ kind: 'closed' }),
    })
    expect(await stopped.refresh({ ...input, snapshot: standing(null) })).toEqual({
      kind: 'unavailable',
      diagnostic: 'the working directory publisher has stopped',
    })
  })
})

describe('one publisher for each tenant', () => {
  const value = { state: 'default', directory: DEFAULT } as const

  it('registers a producer for a tenant once, as the principal issued for that tenant', async () => {
    const w = await world()
    const registered: unknown[] = []
    const publishers = createWorkingDirectoryPublishers<string>({
      principal: tenant => (tenant === access.tenant ? 'producer-a' : undefined),
      runtime: {
        registerProducer: (principal, input) => {
          registered.push([principal, input.tenant])
          return w.runtime.registerProducer(principal, input)
        },
      },
    })
    try {
      await w.restore(true)
      expect(await publishers.publish(access.tenant, w.scope, value)).toEqual({ kind: 'published' })
      expect(
        await publishers.publish(access.tenant, w.scope, { ...value, directory: '/srv/next' }),
      ).toEqual({ kind: 'published' })
      expect(registered).toEqual([['producer-a', access.tenant]])
      expect(await w.read()).toEqual({ ...value, directory: '/srv/next' })
      // A tenant no principal can be issued for has no publisher.
      const stranger = memoryOtherAccess('stranger').tenant
      expect(await publishers.publish(stranger, w.scope, value)).toEqual({
        kind: 'unavailable',
        diagnostic: 'the tenant has no working directory publisher',
      })
      await publishers.close()
      expect(await publishers.publish(access.tenant, w.scope, value)).toEqual({ kind: 'closed' })
      // Closing withdrew the producer: the value it published is gone with it.
      expect(await w.read()).not.toEqual({ ...value, directory: '/srv/next' })
    } finally {
      await publishers.close()
      await w.runtime.close()
    }
  })
})

describe('the declaration of the working directory block', () => {
  it('is a required supplied block the model, the coordinator and extensions read, with its previous value', () => {
    expect(workingDirectoryProducer).toEqual({
      producer: '@omne-harness/session-adapters/session.working-directory',
    })
    expect({ ...workingDirectoryDescriptor, schema: null }).toEqual({
      key: 'session.working-directory',
      schema: null,
      consumers: ['model', 'coordinator', 'extension'],
      required: true,
      disclosure: 'eligibility-checked',
      carriesPrevious: true,
      volatility: 'per-step',
      kind: 'supplied',
      recovery: 'recompute',
    })
    expect(workingDirectoryBindings).toEqual([
      workingDirectoryModelBinding,
      workingDirectoryCallBinding,
    ])
    const needs = workingDirectoryBindings.map(({ key, need }) => [
      key,
      need.name,
      need.consumer,
      need.necessity,
    ])
    expect(needs).toEqual([
      ['session.working-directory', 'session.working-directory-for-model', 'model', 'required'],
      ['session.working-directory', NEED.need, 'coordinator', 'required'],
    ])
  })

  it('withdraws the producer when it is closed while it registers', async () => {
    const w = await world()
    let release: () => void = () => undefined
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    let disposed = 0
    const publisher = createWorkingDirectoryPublisher<string>({
      tenant: access.tenant,
      principal: 'producer',
      runtime: {
        registerProducer: async (principal, input) => {
          await held
          const registered = await w.runtime.registerProducer(principal, input)
          if (registered.kind !== 'registered') return registered
          const { handle } = registered
          return {
            kind: 'registered',
            handle: {
              ...handle,
              dispose: () => {
                disposed++
                return handle.dispose()
              },
            },
          }
        },
      },
    })
    try {
      await w.restore(true)
      const publishing = publisher.publish(w.scope, { state: 'default', directory: DEFAULT })
      const closing = publisher.close()
      release()
      expect(await publishing).toEqual({ kind: 'closed' })
      await closing
      expect(disposed).toBe(1)
      expect(await w.read()).not.toEqual({ state: 'default', directory: DEFAULT })
    } finally {
      await w.runtime.close()
    }
  })
})
