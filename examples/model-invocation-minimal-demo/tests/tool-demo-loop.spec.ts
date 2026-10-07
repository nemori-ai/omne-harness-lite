import { fixturePayload } from './log-payload-fixture.ts'
// @module-tag slow
// Actual TLS model turns and a supervised child process require the slow tier.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { openDemo } from '../src/demo.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'
import { createDemoSupervisor } from '../src/demo-supervisor.ts'

it('runs a model-selected pure tool and resumes the same durable Run through the demo assembly', async () => {
  const parent = resolve('tmp/tool-runtime-loop/tool-demo-tests')
  await mkdir(parent, { mode: 0o700, recursive: true })
  const root = await mkdtemp(join(parent, 'loop-'))
  const tls = await createLocalTls(join(root, 'tls'))
  tls.setMode('tool_nonce')
  const credential = Buffer.from('controlled-tool-demo-key')
  let demo: Awaited<ReturnType<typeof openDemo>> | undefined
  try {
    demo = await openDemo(
      join(root, 'data'),
      { multiplier: 1.1, reserveTokens: 256 },
      demoRetirement(),
      16_384,
      credential,
      { developmentTransport: tls.developmentTransport },
      undefined,
      undefined,
      true,
    )
    const sent = await demo.send('Generate a nonce, then confirm it.', async () => undefined)
    expect(sent.kind, 'tool demo refusal: ' + ('reason' in sent ? sent.reason : sent.kind)).toBe(
      'saved',
    )
    expect(tls.requests).toHaveLength(2)
    expect(JSON.stringify(tls.requests[0]?.body)).toContain('demo__nonce')
    const continuation = tls.requests[1]?.body as {
      messages: {
        role: string
        content: unknown
        tool_calls?: { id: string }[]
        tool_call_id?: string
      }[]
    }
    const assistant = continuation.messages.find(message => message.role === 'assistant')
    const tool = continuation.messages.find(message => message.role === 'tool')
    expect(tool?.tool_call_id).toBe(assistant?.tool_calls?.[0]?.id)
    expect(tool?.tool_call_id).toMatch(/^call_/u)
    expect(tool?.content).toMatch(/^[0-9a-f]{32}$/u)
    const history = await demo.history()
    expect(history.map(item => item.role)).toContain('tool')
    const closed = await demo.close()
    expect(closed.complete).toBe(true)
  } finally {
    credential.fill(0)
    if (demo) await demo.close()
    await tls.close()
  }
})

it('closes a failed model Run using its actual durable failed response', async () => {
  const parent = resolve('tmp/tool-runtime-loop/tool-demo-tests')
  await mkdir(parent, { mode: 0o700, recursive: true })
  const root = await mkdtemp(join(parent, 'failed-'))
  const tls = await createLocalTls(join(root, 'tls'))
  tls.setMode('http503')
  const demo = await openDemo(
    join(root, 'data'),
    { multiplier: 1.1, reserveTokens: 256 },
    demoRetirement(),
    16_384,
    Buffer.from('controlled-tool-demo-key'),
    { developmentTransport: tls.developmentTransport },
    undefined,
    undefined,
    true,
  )
  try {
    expect((await demo.send('Fail this model call.', async () => undefined)).kind).toBe('failed')
    const read = await demo.application.readSessionLog(demo.actor, demo.session)
    expect('entries' in read).toBe(true)
    if (!('entries' in read)) throw new Error('actual history unavailable')
    const endings = read.entries.flatMap(entry => {
      const value = fixturePayload(entry.payload).value
      return value && typeof value === 'object' && 'kind' in value && value.kind === 'run_ended'
        ? [value]
        : []
    })
    expect(endings).toHaveLength(1)
    expect(endings[0]).toMatchObject({ reason: 'failed' })
    expect(tls.requests).toHaveLength(1)
    expect((await demo.close()).complete).toBe(true)
  } finally {
    await demo.close()
    await tls.close()
  }
})

it('streams the tool continuation through the actual supervised demo worker', async () => {
  const parent = resolve('tmp/tool-runtime-loop/tool-demo-tests')
  await mkdir(parent, { mode: 0o700, recursive: true })
  const root = await mkdtemp(join(parent, 'worker-'))
  const tls = await createLocalTls(join(root, 'tls'))
  tls.setMode('tool_nonce')
  const keyFile = join(root, 'key')
  await writeFile(keyFile, 'controlled-tool-worker-key', { mode: 0o600 })
  const supervisor = createDemoSupervisor({
    dataDirectory: join(root, 'data'),
    keyFile,
    tools: true,
    multiplier: '1.1',
    reserveTokens: '256',
    maxOutputTokens: 16_384,
    retirementWaitMilliseconds: 2000,
    maxPacketBytes: 1_048_576,
    maxCommands: 1,
    dedicatedRoot: true,
    developmentTransport: {
      baseUrl: tls.developmentTransport.baseUrl,
      ca: tls.developmentTransport.tls.ca,
    },
  })
  try {
    const demo = await supervisor.open()
    const deliveries: string[] = []
    const sent = await demo.send('Generate a nonce, then confirm it.', async serialized => {
      deliveries.push(serialized)
    })
    expect(sent.kind, 'worker outcome: ' + ('reason' in sent ? sent.reason : sent.kind)).toBe(
      'saved',
    )
    expect(tls.requests).toHaveLength(2)
    expect(deliveries.length).toBeGreaterThan(0)
    expect((await demo.totals()).responses).toBe(2)
    expect((await supervisor.close()).complete).toBe(true)
  } finally {
    await supervisor.close()
    await tls.close()
  }
}, 90_000)

it('returns an actual missing-contribution denial to the model and resumes without a tool execution account', async () => {
  const parent = resolve('tmp/tool-runtime-loop/tool-demo-tests')
  await mkdir(parent, { mode: 0o700, recursive: true })
  const root = await mkdtemp(join(parent, 'denied-'))
  const tls = await createLocalTls(join(root, 'tls'))
  tls.setMode('tool_nonce')
  const demo = await openDemo(
    join(root, 'data'),
    { multiplier: 1.1, reserveTokens: 256 },
    demoRetirement(),
    16_384,
    Buffer.from('controlled-denial-key'),
    {
      developmentTransport: tls.developmentTransport,
      hooks: {
        toolProvidersInstalled: async providers => {
          await providers.officialAdmission.dispose()
        },
      },
    },
    undefined,
    undefined,
    true,
  )
  try {
    const sent = await demo.send(
      'Call the unavailable tool and explain the refusal.',
      async () => undefined,
    )
    expect(sent.kind, JSON.stringify(sent)).toBe('saved')
    expect(tls.requests).toHaveLength(2)
    const continuation = tls.requests[1]!.body as {
      messages: { role: string; content: unknown; tool_call_id?: string }[]
    }
    const reply = continuation.messages.find(message => message.role === 'tool')!
    expect(reply.tool_call_id).toMatch(/^call_/u)
    expect(reply.content).toContain('official admission chain or contribution is absent')
    const read = await demo.application.readSessionLog(demo.actor, demo.session)
    if (!('entries' in read)) throw new Error('actual history unavailable')
    const kinds = read.entries.flatMap(entry => {
      const value = fixturePayload(entry.payload).value
      return value && typeof value === 'object' && 'kind' in value ? [value.kind] : []
    })
    expect(kinds.filter(kind => kind === 'action_denied')).toHaveLength(1)
    expect(kinds).not.toContain('execution_intended')
    expect(kinds).toContain('continuation_requested')
    expect(kinds).toContain('run_ended')
    expect((await demo.close()).complete).toBe(true)
  } finally {
    await demo.close()
    await tls.close()
  }
})
