// @module-tag slow
// Real Cordis/runtime/context/admission/log/result providers execute a native systemd command.
import { randomUUID } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { projectToolJournal, type ToolExecutor } from '@omne-harness-lite/tool-execution-runtime'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import { scope, origin, tool, at, type FixtureTool } from './tool-driver-history-fixture.ts'

test(
  'host facility completes through the original runtime/context/log and reopens without replay',
  { tags: ['slow'] },
  async () => {
    const nonce = randomUUID(),
      commandTool: FixtureTool = {
        ...tool,
        capability: capabilityCanonicalString({ category: 'tool', name: tool.name }),
        definition: {
          ...tool.definition,
          settings: {
            targetEnvironment: {
              category: 'placement_identity' as const,
              default: { bindingLayer: 'host_machine', facilities: ['command'] },
            },
          },
        },
      }
    // This consumer fixture is not the formal Shell tool delivered by PR4b.
    const executor = vi.fn<ToolExecutor>(async (_arguments, ports) => {
      const read = await ports.context.read(['workspace'])
      if (read.kind !== 'values') throw new Error(`Original context ${read.reason}`)
      const cwd = read.values.find(value => value.key === 'workspace')?.value
      if (typeof cwd !== 'string') throw new Error('Original workspace context missing')
      const started = await ports.environment?.command?.start({
        executable: '/bin/sh',
        args: ['-c', 'printf "%s|%s" "$TOKEN" "$PWD"; printf stderr >&2'],
        cwd,
        env: { TOKEN: nonce },
      })
      if (started?.kind !== 'started') throw new Error(`Original native command ${started?.kind}`)
      const text = { terminal: '' }
      for await (const chunk of started.process.output) {
        if (chunk.stream !== 'terminal') throw new Error('Wrong native output mode')
        text.terminal += Buffer.from(chunk.data).toString('utf8')
      }
      expect(await started.process.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
      expect(started.process.outputMode).toBe('terminal')
      expect(text.terminal).toBe(`${nonce}|/tmpstderr`)
      return text.terminal
    })
    const fixture = await actionIntegrationFixture({
      executor,
      contextKeys: ['workspace'],
      contextSources: [
        {
          name: 'session',
          consumers: ['model', 'tool'],
          requiredKeys: ['workspace'],
          recovery: 'persisted',
          read: async () => ({
            kind: 'values',
            values: [{ key: 'workspace', revision: 'seed', value: '/tmp', observedAt: at }],
          }),
        },
      ],
      contextSeed: {
        required: [
          {
            key: 'workspace',
            source: 'session',
            config: null,
            consumers: ['model', 'tool'],
            required: true,
            recovery: 'persisted',
          },
        ],
        initial: [{ key: 'workspace', revision: 'seed', value: '/tmp', observedAt: at }],
        fixed: [{ key: 'workspace', value: '/tmp' }],
      },
      environment: { tool: commandTool, host: { provider: 'real-host' } },
    })
    try {
      const dispatch = await fixture.dispatch()
      if (dispatch.kind !== 'complete') throw new Error('Official admission incomplete')
      const submission = {
        access: fixture.current.toolAccess,
        scope,
        origin,
        adoption: fixture.f.adoption,
        call: fixture.f.calls[0]!,
        admissionToken: dispatch.admissions[0]!.token,
      }
      const runtime = fixture.current.assembly.ctx.toolRuntimeRegistry
      const result = await runtime.submit(submission)
      if (result.kind !== 'recorded') throw new Error(`Original submit ${result.reason}`)
      const acquired = await runtime.acquire(submission.access, result.execution)
      if (acquired.kind !== 'acquired') throw new Error('Original execution observer missing')
      try {
        const ended = await acquired.observer.waitForEnd()
        expect(ended, JSON.stringify(ended)).toMatchObject({
          snapshot: {
            adoptedContext: [{ key: 'workspace', value: '/tmp' }],
            state: { terminal: { outcome: 'completed', result: `${nonce}|/tmpstderr` } },
            resources: [
              { permission: 'permitted', ownership: 'call', observation: { status: 'confirmed' } },
            ],
          },
        })
      } finally {
        acquired.observer.release()
      }
      const history = projectToolJournal(scope, (await fixture.f.prefix()).entries)
      if ('invalid' in history) throw new Error('Original durable projection invalid')
      const execution = history.executions.get(submission.call.callId)!
      expect(execution.environment?.value.adoption.description.facilities).toEqual([
        'command',
        'files',
      ])
      expect(execution.resources.size).toBe(1)
      expect(execution.contextReads).toHaveLength(1)
      expect(
        await fixture.current.assembly.ctx.toolResults.readResult(
          submission.access,
          result.execution,
        ),
      ).toMatchObject({
        kind: 'found',
        value: { result: { content: [{ text: `${nonce}|/tmpstderr` }] } },
      })
      expect(await runtime.submit(submission)).toEqual(result)
      await fixture.reopen()
      const replayed = await fixture.current.assembly.ctx.toolRuntimeRegistry.acquire(
        fixture.current.toolAccess,
        result.execution,
      )
      if (replayed.kind !== 'acquired') throw new Error('Reopened observer missing')
      try {
        expect(await replayed.observer.waitForEnd()).toMatchObject({
          snapshot: { state: { terminal: { result: `${nonce}|/tmpstderr` } } },
        })
      } finally {
        replayed.observer.release()
      }
      expect(executor).toHaveBeenCalledOnce()
    } finally {
      await fixture.close()
    }
  },
)

test.each(['nonzero', 'rejected', 'stopped'] as const)(
  'host %s observation belongs to the original runtime call',
  { tags: ['slow'] },
  async scenario => {
    const commandTool: FixtureTool = {
      ...tool,
      capability: capabilityCanonicalString({ category: 'tool', name: tool.name }),
      definition: {
        ...tool.definition,
        settings: {
          targetEnvironment: {
            category: 'placement_identity',
            default: { bindingLayer: 'host_machine', facilities: ['command'] },
          },
        },
      },
    }
    const executor: ToolExecutor = async (_arguments, ports) => {
      const started = await ports.environment!.command!.start({
        executable: scenario === 'rejected' ? '' : '/bin/sh',
        args: [
          '-c',
          scenario === 'nonzero' ? 'printf nonzero; exit 7' : 'printf entered; sleep 120',
        ],
        cwd: '/tmp',
        env: { PATH: '/usr/bin:/bin' },
      })
      if (scenario === 'rejected') {
        expect(started).toEqual({ kind: 'rejected', reason: 'invalidInput' })
        return 'rejected-before-native'
      }
      if (started.kind !== 'started') throw new Error('Host command not started')
      if (scenario === 'stopped') {
        for await (const part of started.process.output) {
          expect(Buffer.from(part.data).toString()).toBe('entered')
          break
        }
        expect(await started.process.stop('forced')).toBe('confirmed')
        expect((await started.process.result).kind).toBe('failed')
        return 'original-physical-stop'
      }
      expect(await started.process.result).toMatchObject({ kind: 'completed', exit: { code: 7 } })
      return 'original-nonzero-7'
    }
    const fixture = await actionIntegrationFixture({
      executor,
      environment: { tool: commandTool, host: { provider: 'real-host' } },
    })
    try {
      const dispatch = await fixture.dispatch()
      if (dispatch.kind !== 'complete') throw new Error('Original admission missing')
      const submission = {
        access: fixture.current.toolAccess,
        scope,
        origin,
        adoption: fixture.f.adoption,
        call: fixture.f.calls[0]!,
        admissionToken: dispatch.admissions[0]!.token,
      }
      const runtime = fixture.current.assembly.ctx.toolRuntimeRegistry,
        submitted = await runtime.submit(submission)
      if (submitted.kind !== 'recorded') throw new Error('Original submit rejected')
      const acquired = await runtime.acquire(submission.access, submitted.execution)
      if (acquired.kind !== 'acquired') throw new Error('Original observer missing')
      try {
        const ended = await acquired.observer.waitForEnd()
        expect(ended).toMatchObject({
          snapshot: {
            state: {
              terminal: {
                outcome: 'completed',
                result:
                  scenario === 'rejected'
                    ? 'rejected-before-native'
                    : scenario === 'stopped'
                      ? 'original-physical-stop'
                      : 'original-nonzero-7',
              },
            },
          },
        })
      } finally {
        acquired.observer.release()
      }
      const history = projectToolJournal(scope, (await fixture.f.prefix()).entries)
      if ('invalid' in history) throw new Error('Original journal invalid')
      const execution = history.executions.get(submission.call.callId)!
      expect(execution.resources.size).toBe(scenario === 'rejected' ? 0 : 1)
      for (const resource of execution.resources.values())
        expect(resource.observations.at(-1)?.value).toMatchObject({ status: 'confirmed' })
    } finally {
      await fixture.close()
    }
  },
)

test(
  'original runtime retains terminal transfer through provider retirement and reopen without replay',
  { tags: ['slow'] },
  async () => {
    const commandTool: FixtureTool = {
      ...tool,
      capability: capabilityCanonicalString({ category: 'tool', name: tool.name }),
      definition: {
        ...tool.definition,
        settings: {
          targetEnvironment: {
            category: 'placement_identity',
            default: { bindingLayer: 'host_machine', facilities: ['command'] },
          },
        },
      },
    }
    const executor = vi.fn<ToolExecutor>(async (_arguments, ports) => {
      const created = await ports.environment!.command!.createTerminal({ cwd: '/tmp', env: {} })
      if (created.kind !== 'created') throw new Error(created.reason)
      return JSON.stringify(created.terminal)
    })
    const fixture = await actionIntegrationFixture({
      executor,
      environment: { tool: commandTool, host: { provider: 'real-host' } },
    })
    try {
      const dispatch = await fixture.dispatch()
      if (dispatch.kind !== 'complete') throw new Error('Original admission incomplete')
      const submission = {
        access: fixture.current.toolAccess,
        scope,
        origin,
        adoption: fixture.f.adoption,
        call: fixture.f.calls[0]!,
        admissionToken: dispatch.admissions[0]!.token,
      }
      const runtime = fixture.current.assembly.ctx.toolRuntimeRegistry
      const result = await runtime.submit(submission)
      if (result.kind !== 'recorded') throw new Error(result.reason)
      const observed = await runtime.acquire(submission.access, result.execution)
      if (observed.kind !== 'acquired') throw new Error('Original observer missing')
      try {
        expect(await observed.observer.waitForEnd()).toMatchObject({
          snapshot: {
            state: { terminal: { outcome: 'completed' } },
            resources: [{ permission: 'permitted', ownership: 'environment' }],
          },
        })
      } finally {
        observed.observer.release()
      }
      let history = projectToolJournal(scope, (await fixture.f.prefix()).entries)
      if ('invalid' in history) throw new Error('Invalid original history')
      const original = history.executions
        .get(submission.call.callId)!
        .resources.values()
        .next().value!
      expect(original.adopted?.value).toMatchObject({
        kind: 'resource_adopted',
        key: original.planned.value.resource.key,
      })
      expect(original.observations).toHaveLength(0)
      await fixture.reopen()
      history = projectToolJournal(scope, (await fixture.f.prefix()).entries)
      if ('invalid' in history) throw new Error('Invalid reopened history')
      const recovered = history.executions
        .get(submission.call.callId)!
        .resources.get(original.planned.value.resource.key)!
      expect(recovered.adopted?.value).toEqual(original.adopted!.value)
      // Graceful retirement completed the environment owner, so no outstanding
      // resource is enumerated into the creator call's log on startup.
      const confirmation = await fixture.current.assembly.ctx.executionEnvironments.recover(
        scope,
        fixture.current.owner.recovery,
        [original.planned.value.resource],
      )
      expect(confirmation).toMatchObject([
        { status: 'confirmedStopped', resource: original.planned.value.resource },
      ])
      expect(executor).toHaveBeenCalledOnce()
    } finally {
      await fixture.close()
    }
  },
)
