import { expect, test, vi } from 'vitest'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import {
  scope,
  ref,
  request,
  access,
  definition,
  deferred,
  fixture,
} from './execution-owner-fixture.ts'

import {
  environmentDefinition,
  environmentPorts,
  completed,
} from './execution-environment-fixture.ts'

test.each([{ facilities: ['files'] }, { facilities: ['command', 'files'] }])(
  'injects exactly the effective facilities $facilities from one original lease',
  async ({ facilities }) => {
    const p = environmentPorts(),
      tool: ToolDefinition = {
        ...environmentDefinition,
        settings: {
          targetEnvironment: {
            category: 'placement_identity',
            default: { bindingLayer: 'host_machine', facilities },
          },
        },
      }
    const placement = { ...p.placement, requirement: { ...p.placement.requirement, facilities } }
    p.operations.resolvePlacement.mockResolvedValue({ kind: 'placement', placement })
    p.acquire.mockResolvedValue({
      ...p.acquired,
      adoption: { ...p.acquired.adoption, placement },
    })
    const f = await fixture(
      async (_args, dependencies) => {
        const environment = dependencies.environment
        if (!environment) throw new Error('Original environment not injected')
        expect(environment.description.facilities).toEqual(['command', 'files'])
        expect(Boolean(environment.command)).toBe(facilities.includes('command'))
        if (!environment.files) throw new Error('Required file facility not injected')
        expect(await environment.files.read({ path: '/original' })).toEqual({
          kind: 'rejected',
          reason: 'unavailable',
        })
        expect(
          await environment.files.write({
            path: '/original',
            data: new Uint8Array([1]),
            mode: 'replace',
          }),
        ).toEqual({
          kind: 'rejected',
          reason: 'unavailable',
        })
        return 'original facilities'
      },
      undefined,
      tool,
      p.operations,
    )
    try {
      await f.owner.operations.submit(request)
      await f.owner.idle()
      expect(f.implementation).toHaveBeenCalledOnce()
      expect(p.acquire).toHaveBeenCalledOnce()
      expect(p.release).toHaveBeenCalledOnce()
      const observer = await f.observer()
      expect(await observer.read()).toMatchObject({
        snapshot: { state: { terminal: { outcome: 'completed', result: 'original facilities' } } },
      })
      observer.release()
    } finally {
      await f.close()
    }
  },
)

test('author gets only required facilities after actual durable adoption and receives output before command completion', async () => {
  const p = environmentPorts(),
    seen: string[] = []
  const f = await fixture(
    async (_args, dependencies) => {
      const view = await f.journal.read(scope, ref.callId)
      if (view.kind !== 'view') throw new Error('actual journal unavailable')
      expect(view.executions.get(ref.callId)?.environment?.value.adoption).toEqual(
        p.acquired.adoption,
      )
      expect(dependencies.environment?.description.facilities).toEqual(['command', 'files'])
      expect(dependencies.environment?.files).toBeUndefined()
      const started = await dependencies.environment?.command?.start({
        executable: 'controlled',
        args: [],
        cwd: '/controlled',
        env: {},
      })
      if (!started || started.kind !== 'started') throw new Error('command missing')
      let finished = false
      void started.process.result.then(() => {
        finished = true
      })
      for await (const chunk of started.process.output) {
        seen.push(new TextDecoder().decode(chunk.data))
        break
      }
      expect(finished).toBe(false)
      expect(p.stop).not.toHaveBeenCalled()
      p.result.resolve(completed)
      await started.process.result
      return seen[0]!
    },
    undefined,
    environmentDefinition,
    p.operations,
  )
  try {
    expect(await f.owner.operations.submit(request)).toHaveProperty('kind', 'recorded')
    await f.owner.idle()
    expect(f.implementation).toHaveBeenCalledOnce()
    expect(p.acquire).toHaveBeenCalledOnce()
    const observer = await f.observer()
    expect(await observer.read()).toMatchObject({
      snapshot: {
        adoptedEnvironment: p.acquired.adoption,
        state: { terminal: { outcome: 'completed', result: 'first-output' } },
      },
    })
    const view = await f.journal.read(scope, ref.callId)
    if (view.kind !== 'view') throw new Error('actual journal unavailable')
    const history = view.executions.get(ref.callId)!
    expect(history.resources.get('process')?.permitted).toBeDefined()
    expect(
      Number(history.resources.get('process')?.observations[0]?.entry.position),
    ).toBeGreaterThan(Number(history.terminal?.entry.position))
    expect(p.release).toHaveBeenCalledOnce()
  } finally {
    p.result.resolve(completed)
    await f.close()
  }
})
test('missing required command facility prevents both durable adoption and author entry and releases the original lease', async () => {
  const p = environmentPorts()
  p.acquire.mockImplementation(async () => ({
    ...p.acquired,
    lease: {
      ...p.acquired.lease,
      facilities: { description: p.acquired.lease.facilities.description },
    },
  }))
  const f = await fixture(
    async () => 'must-not-run',
    undefined,
    environmentDefinition,
    p.operations,
  )
  try {
    await f.owner.operations.submit(request)
    await f.owner.idle()
    expect(f.implementation).not.toHaveBeenCalled()
    expect(p.release).toHaveBeenCalledOnce()
    const observer = await f.observer()
    expect(await observer.read()).toMatchObject({
      snapshot: {
        state: { terminal: { outcome: 'unavailable', reason: 'environment:missingFacility' } },
      },
    })
    const view = await f.journal.read(scope, ref.callId)
    expect(view.kind === 'view' && view.executions.get(ref.callId)?.environment).toBeUndefined()
  } finally {
    await f.close()
  }
})
test('unknown adoption receipt reuses the original lease and invokes once only after recognition', async () => {
  const p = environmentPorts(),
    f = await fixture(async () => 'once', undefined, environmentDefinition, p.operations)
  let lost = false
  f.append.mockImplementation(async (...args) => {
    const result = await f.log.append(...args)
    if (
      !lost &&
      args[1].some(entry => JSON.stringify(entry.payload).includes('execution_environment_adopted'))
    ) {
      lost = true
      return { failure: 'unavailable' }
    }
    return result
  })
  try {
    await f.owner.operations.submit(request)
    await f.owner.idle()
    expect(f.implementation).not.toHaveBeenCalled()
    expect(p.acquire).toHaveBeenCalledOnce()
    expect(p.release).not.toHaveBeenCalled()
    await f.owner.operations.submit(request)
    await f.owner.idle()
    expect(f.implementation).toHaveBeenCalledOnce()
    expect(p.acquire).toHaveBeenCalledOnce()
    expect(p.release).toHaveBeenCalledOnce()
  } finally {
    await f.close()
  }
})
test('terminal wins while original placement is pending and prevents acquire and author entry', async () => {
  const p = environmentPorts(),
    gate = deferred<void>(),
    entered = deferred<void>()
  p.resolvePlacement.mockImplementation(async () => {
    entered.resolve()
    await gate.promise
    return { kind: 'placement', placement: p.placement }
  })
  const f = await fixture(
    async () => 'must-not-run',
    undefined,
    environmentDefinition,
    p.operations,
  )
  try {
    await f.owner.operations.submit(request)
    await entered.promise
    expect(await f.owner.operations.stop(access, ref, 'user_stop')).toBe('stopped')
    gate.resolve()
    await f.owner.idle()
    expect(p.acquire).not.toHaveBeenCalled()
    expect(f.implementation).not.toHaveBeenCalled()
  } finally {
    gate.resolve()
    await f.close()
  }
})
test('pending release retains the same lease for explicit close retry and never invokes a successor', async () => {
  const p = environmentPorts(),
    f = await fixture(async () => 'once', undefined, environmentDefinition, p.operations)
  p.release.mockResolvedValue({ kind: 'pending', resources: [] })
  try {
    await f.owner.operations.submit(request)
    await f.owner.idle()
    await expect(f.owner.close()).rejects.toThrow('environment cleanup obligation')
    expect(f.implementation).toHaveBeenCalledOnce()
    expect(p.acquire).toHaveBeenCalledOnce()
    p.release.mockResolvedValue({ kind: 'released' })
    await f.owner.close()
    expect(p.release).toHaveBeenCalledTimes(3)
    expect(p.acquire).toHaveBeenCalledOnce()
  } finally {
    p.release.mockResolvedValue({ kind: 'released' })
    await f.close()
  }
})

test('closing before the physical permit append completes retains the fact but never grants a new effect', async () => {
  const p = environmentPorts(),
    appending = deferred<void>(),
    resume = deferred<void>()
  const f = await fixture(
    async (_args, dependencies) => {
      expect(
        await dependencies.environment!.command!.start({
          executable: 'controlled',
          args: [],
          cwd: '/controlled',
          env: {},
        }),
      ).toEqual({ kind: 'rejected', reason: 'closed' })
      if (!dependencies.signal.aborted)
        await new Promise<void>(resolve =>
          dependencies.signal.addEventListener('abort', () => resolve(), { once: true }),
        )
      return 'late-return'
    },
    undefined,
    environmentDefinition,
    p.operations,
  )
  let closing: Promise<void> | undefined
  f.append.mockImplementation(async (...args) => {
    if (args[1].some(entry => JSON.stringify(entry.payload).includes('resource_permitted'))) {
      appending.resolve()
      await resume.promise
    }
    return f.log.append(...args)
  })
  try {
    await f.owner.operations.submit(request)
    await appending.promise
    closing = f.owner.close()
    expect(p.resources()?.closed.aborted).toBe(true)
    resume.resolve()
    await closing
    expect(f.implementation).toHaveBeenCalledOnce()
    expect(p.acquire).toHaveBeenCalledOnce()
    expect(p.release).toHaveBeenCalledOnce()
    expect(p.stop).not.toHaveBeenCalled()
    const prefix = await f.log.readSince(scope.session, 0)
    if ('failure' in prefix) throw new Error('Original physical prefix unavailable')
    const view = projectToolJournal(scope, prefix.entries)
    if ('invalid' in view) throw new Error('Original permit fact invalid')
    expect(view.executions.get(ref.callId)?.resources.get('process')?.permitted).toBeDefined()
    expect(view.executions.get(ref.callId)?.terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
  } finally {
    resume.resolve()
    p.result.resolve(completed)
    await closing
    await f.close()
  }
})
