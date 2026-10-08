import { fixturePayload } from './log-payload-fixture.ts'
import { retainJournalBatchesThrough } from './sql-batches-fixture.ts'
// @module-tag slow
// Actual TLS, SQL, two sessions and cold SQL journal recovery require multiple application lifetimes.
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { Context } from '@deepseek-ai/cordis'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { captureSessionRecipe } from '@omne-harness-lite/evaluation-input-store/publication'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { openDemo } from '../src/demo.ts'
import { MODEL, DEMO_ROOT, createDemoConfig } from '../src/deployment.ts'
import { DEMO_TOOL_IMPLEMENTATIONS } from '../src/demo-tools.ts'
import type { AcceptanceEvent } from '../src/types.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'
import { latch } from './support.ts'

async function seed(cuts: readonly ('execution_ended' | 'delivery_ready')[]) {
  const parent = resolve('tmp/tool-runtime-loop/tool-startup-recovery')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const root = await mkdtemp(join(parent, 'cold-')),
    data = join(root, 'data'),
    tls = await createLocalTls(join(root, 'tls')),
    sessions: string[] = []
  tls.setMode('tool_nonce')
  let storage: AtomicStorage | undefined, context: Context | undefined
  const options = {
    developmentTransport: tls.developmentTransport,
    hooks: {
      storageOpened(value: AtomicStorage) {
        storage = value
      },
      async fiberCreated(name: string, fiber: import('@deepseek-ai/cordis').Fiber) {
        if (name === 'evaluationInputs') {
          await fiber
          context = fiber.ctx
        }
      },
    },
  }
  const host = {
    covered: true,
    processOwnership: {
      current: 'isolated-recovery-test',
      async observeExit() {
        return 'exited' as const
      },
    },
  }
  let demo: Awaited<ReturnType<typeof openDemo>> | undefined
  try {
    demo = await openDemo(
      data,
      { multiplier: 1.1, reserveTokens: 256 },
      demoRetirement(),
      16_384,
      Buffer.from('controlled-recovery-key'),
      options,
      undefined,
      host,
      true,
    )
    sessions.push(demo.session)
    expect((await demo.send('Generate a nonce.', async () => undefined)).kind).toBe('saved')
    if (cuts.length === 2) {
      const second = 'second-owned-tool-session'
      expect((await demo.application.createToolSession(demo.actor, second)).kind).toBe('bound')
      expect(await demo.application.prepareSession(demo.actor, second)).toHaveProperty(
        'session',
        second,
      )
      // Reuse the already published global inputs. The normal demo publishes once.
      const deployed = createDemoConfig(
        data,
        'second-session-seed',
        () => '2026-10-05T00:00:00Z',
        { multiplier: 1.1, reserveTokens: 256 },
        demoRetirement(),
        true,
      )
      if (!storage || !context || !deployed.modelRequest)
        throw new Error('actual input owners absent')
      expect(
        await captureSessionRecipe(
          {
            storage,
            memberships: context.memberships,
            sessionTenancy: context.sessionTenancy,
            storeKey: deployed.modelRequest.evaluationInputs.storeKey,
            deployedOfficial: deployed.modelRequest.evaluationInputs.deployedOfficial,
            diagnostics() {},
            onDiagnosticFailure() {},
            monotonicNow: () => process.hrtime.bigint(),
          },
          { session: second, tenant: demo.actor.tenant, rootDefinition: DEMO_ROOT },
        ),
      ).toEqual({ captured: true })
      const current = await context.currentEvaluationInputs.read(
        unwrap(parseOpaqueIdentifier(second, 'SessionRef')),
        demo.actor.tenant,
      )
      if ('failure' in current) throw new Error('actual second-session inputs unavailable')
      const evaluated = evaluate(current.input)
      if (!('ok' in evaluated)) throw new Error('actual second-session evaluation unavailable')
      expect(
        await context.assetRegistry.fill(
          second,
          evaluated.ok,
          unwrap(parseOpaqueIdentifier('second-session-evaluation', 'EvaluationRef')),
          evaluated.ok.composition,
        ),
      ).toHaveProperty('snapshots')
      expect(await demo.application.selectModel(demo.actor, second, MODEL)).toHaveProperty(
        'selected',
      )
      expect((await demo.close()).complete).toBe(true)
      const stateFile = join(data, 'demo-state.json')
      const state = JSON.parse(await readFile(stateFile, 'utf8'))
      await writeFile(stateFile, JSON.stringify({ ...state, session: second }) + '\n')
      demo = await openDemo(
        data,
        { multiplier: 1.1, reserveTokens: 256 },
        demoRetirement(),
        16_384,
        Buffer.from('controlled-recovery-key'),
        options,
        undefined,
        host,
        true,
      )
      sessions.push(demo.session)
      tls.setMode('tool_nonce')
      expect((await demo.send('Generate another nonce.', async () => undefined)).kind).toBe('saved')
    }
    expect((await demo.close()).complete).toBe(true)
    demo = undefined
    for (const [index, session] of sessions.entries()) {
      // Keep whole original commits and corresponding indexes after the application closes.
      retainJournalBatchesThrough(join(data, 'db.sqlite'), session, cuts[index]!)
    }
    return { data, tls, options, host, sessions }
  } catch (error) {
    await demo?.close()
    await tls.close()
    throw error
  }
}

it('cold startup delivers A/B obligations for every owned session before opening the gate, without rerunning tools', async () => {
  const f = await seed(['execution_ended', 'delivery_ready']),
    entered = latch(),
    release = latch(),
    events: AcceptanceEvent[] = [],
    executor = vi.spyOn(DEMO_TOOL_IMPLEMENTATIONS[1]!, 'executor'),
    requestsBefore = f.tls.requests.length
  let demo: Awaited<ReturnType<typeof openDemo>> | undefined
  const opening = openDemo(
    f.data,
    { multiplier: 1.1, reserveTokens: 256 },
    demoRetirement(),
    16_384,
    Buffer.from('controlled-recovery-key'),
    {
      ...f.options,
      diagnostics: { record: event => events.push(event) },
      hooks: {
        sessionLogOpened(log) {
          const append = log.append.bind(log)
          return {
            ...log,
            append: async (...args: Parameters<typeof log.append>) => {
              if (
                args[1].some(
                  entry => fixturePayload(entry.payload).value.kind === 'delivery_confirmed',
                )
              ) {
                entered.resolve()
                await release.promise
              }
              return append(...args)
            },
          }
        },
      },
    },
    undefined,
    f.host,
    true,
  )
  let opened = false
  void opening.then(
    () => {
      opened = true
    },
    () => undefined,
  )
  try {
    await Promise.race([
      entered.promise,
      opening.then(() => {
        throw new Error('startup opened before the held delivery')
      }),
    ])
    expect(opened).toBe(false)
    expect(events.filter(event => event.event === 'gate' && event.outcome === 'open')).toEqual([])
    expect(f.tls.requests).toHaveLength(requestsBefore)
    release.resolve()
    demo = await opening
    expect(demo.session).toBe(f.sessions[1])
    for (const session of f.sessions) {
      const read = await demo.application.readSessionLog(demo.actor, session)
      if (!('entries' in read)) throw new Error('actual recovered log unavailable')
      const tools = projectToolJournal(
        {
          tenant: demo.actor.tenant,
          session: unwrap(parseOpaqueIdentifier(session, 'SessionRef')),
        },
        read.entries,
      )
      if ('invalid' in tools) throw new Error('actual recovered tool journal invalid')
      expect(tools.executions.size).toBe(1)
      for (const execution of tools.executions.values()) {
        expect(execution.confirmed?.value.message.type).toBe('tool')
        expect(execution.confirmed?.value.message.blocks).toEqual([execution.ready?.value.result])
      }
    }
    expect(executor).not.toHaveBeenCalled()
    expect(f.tls.requests).toHaveLength(requestsBefore)
    expect((await demo.close()).complete).toBe(true)
  } finally {
    release.resolve()
    demo ??= await opening.catch(() => undefined)
    await demo?.close()
    executor.mockRestore()
    await f.tls.close()
  }
}, 120_000)

it('cold startup with a missing result refuses Ready and never repeats the tool', async () => {
  const f = await seed(['execution_ended']),
    events: AcceptanceEvent[] = [],
    executor = vi.spyOn(DEMO_TOOL_IMPLEMENTATIONS[1]!, 'executor'),
    requestsBefore = f.tls.requests.length
  try {
    await rm(join(f.data, 'tool-results'), { recursive: true })
    await expect(
      openDemo(
        f.data,
        { multiplier: 1.1, reserveTokens: 256 },
        demoRetirement(),
        16_384,
        Buffer.from('controlled-recovery-key'),
        {
          ...f.options,
          diagnostics: { record: event => events.push(event) },
        },
        undefined,
        f.host,
        true,
      ),
    ).rejects.toThrow()
    expect(events.filter(event => event.event === 'gate' && event.outcome === 'open')).toEqual([])
    expect(executor).not.toHaveBeenCalled()
    expect(f.tls.requests).toHaveLength(requestsBefore)
  } finally {
    executor.mockRestore()
    await f.tls.close()
  }
}, 120_000)
