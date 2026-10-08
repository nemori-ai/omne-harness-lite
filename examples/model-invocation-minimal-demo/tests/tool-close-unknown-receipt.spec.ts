import { fixturePayload } from './log-payload-fixture.ts'
// @module-tag slow
// Actual TLS and SQL owners remain live across failed close and its retry.
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { openDemo } from '../src/demo.ts'
import { createAcceptanceApplication, createDemoConfig } from '../src/index.ts'
import { DEMO_TOOL_IMPLEMENTATIONS } from '../src/demo-tools.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'

async function directory(label: string) {
  const parent = resolve('tmp/tool-runtime-loop/tool-close-unknown')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  return mkdtemp(join(parent, label + '-'))
}

test('actual complete C with an unknown receipt retains its physical owner until the original close can recognize it', async () => {
  const root = await directory('lost-C'),
    data = join(root, 'data'),
    tls = await createLocalTls(join(root, 'tls'))
  tls.setMode('tool_nonce')
  let hide = false,
    lost = false
  const executor = vi.spyOn(DEMO_TOOL_IMPLEMENTATIONS[1]!, 'executor')
  const demo = await openDemo(
    data,
    { multiplier: 1.1, reserveTokens: 256 },
    demoRetirement(),
    16384,
    Buffer.from('controlled-unknown-C-key'),
    {
      developmentTransport: tls.developmentTransport,
      hooks: {
        sessionLogOpened(log) {
          return {
            ...log,
            async append(...args) {
              const C = args[1].some(
                entry => fixturePayload(entry.payload).value.kind === 'delivery_confirmed',
              )
              const result = await log.append(...args)
              if (C && !lost && !('failure' in result)) {
                lost = true
                hide = true
                return { failure: 'unavailable' as const }
              }
              return result
            },
            async readSince(...args) {
              return hide ? { failure: 'unavailable' as const } : log.readSince(...args)
            },
          }
        },
      },
    },
    undefined,
    undefined,
    true,
  )
  try {
    expect(await demo.send('Generate a nonce.', async () => {})).toMatchObject({ kind: 'refused' })
    expect(lost).toBe(true)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(await demo.close()).toMatchObject({ complete: false })
    const competing = createAcceptanceApplication(
      createDemoConfig(
        data,
        'competing-close',
        async () => new Date().toISOString(),
        { multiplier: 1.1, reserveTokens: 256 },
        demoRetirement(),
        true,
      ),
      {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
      },
    )
    await expect(competing.ready).rejects.toThrow()
    expect((await competing.close()).complete).toBe(true)
    expect(
      (await demo.application.createToolSession(demo.actor, 'after-unconfirmed-close')).kind,
    ).toBe('rejected')
    hide = false
    expect(await demo.close()).toMatchObject({ complete: true })
    expect(executor).toHaveBeenCalledTimes(1)
    expect(tls.requests).toHaveLength(1)
    const physical = await openSqlLogFixture({ file: join(data, 'db.sqlite') })
    try {
      const session = unwrap(parseOpaqueIdentifier(demo.session, 'SessionRef'))
      const history = await physical.readSince(session, 0)
      if ('failure' in history) throw new Error('recognized C physical history unavailable')
      const tools = projectToolJournal({ tenant: demo.actor.tenant, session }, history.entries)
      if ('invalid' in tools) throw new Error('recognized C violates the public journal')
      expect(tools.executions.size).toBe(1)
      expect([...tools.executions.values()][0]!.confirmed).toBeDefined()
      expect([...tools.executions.values()][0]!.terminal!.value.terminal.outcome).toBe('completed')
      const messages = history.entries.filter(
        entry =>
          entry.payload &&
          typeof entry.payload === 'object' &&
          'value' in entry.payload &&
          entry.payload.value &&
          typeof entry.payload.value === 'object' &&
          'type' in entry.payload.value &&
          entry.payload.value.type === 'tool',
      )
      expect(messages).toHaveLength(1)
    } finally {
      await physical.close()
    }
  } finally {
    hide = false
    await demo.close()
    executor.mockRestore()
    await tls.close()
  }
})

test('throwing diagnostics and observer delivery do not change actual tool success or model continuation', async () => {
  const root = await directory('observer-failure'),
    tls = await createLocalTls(join(root, 'tls'))
  tls.setMode('tool_nonce')
  const diagnostics = vi.fn(() => {
    throw new Error('controlled diagnostic failure')
  })
  const consume = vi.fn(async () => {
    throw new Error('controlled observer failure')
  })
  const demo = await openDemo(
    join(root, 'data'),
    { multiplier: 1.1, reserveTokens: 256 },
    demoRetirement(),
    16384,
    Buffer.from('controlled-observer-failure-key'),
    { developmentTransport: tls.developmentTransport, diagnostics: { record: diagnostics } },
    undefined,
    undefined,
    true,
  )
  try {
    expect(await demo.send('Generate a nonce.', consume)).toMatchObject({
      kind: 'saved',
      released: true,
    })
    expect(diagnostics).toHaveBeenCalled()
    expect(consume).toHaveBeenCalled()
    expect(demo.application.status().diagnosticFailures).toBeGreaterThan(0)
    const history = await demo.application.readSessionLog(demo.actor, demo.session)
    if (!('entries' in history)) throw new Error('actual tool history unavailable')
    const tools = projectToolJournal(
      {
        tenant: demo.actor.tenant,
        session: unwrap(parseOpaqueIdentifier(demo.session, 'SessionRef')),
      },
      history.entries,
    )
    if ('invalid' in tools) throw new Error('actual observer-failure history invalid')
    expect(tools.executions.size).toBe(1)
    expect([...tools.executions.values()][0]!.terminal!.value.terminal.outcome).toBe('completed')
    expect([...tools.executions.values()][0]!.confirmed).toBeDefined()
    expect(tls.requests).toHaveLength(2)
    expect(await demo.close()).toMatchObject({ complete: true })
  } finally {
    await demo.close()
    await tls.close()
  }
})
