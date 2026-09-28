import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable, Writable, PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { openDemo } from '../src/demo.ts'
import { runInteractive } from '../src/interactive.ts'
import { createLocalTls } from './local-tls.ts'

function latch() {
  let release: () => void = () => undefined
  const promise = new Promise<void>(resolve => {
    release = resolve
  })
  return { promise, release }
}

async function setup(label: string) {
  const parent = resolve('tmp/model-request-runtime/minimal-demo-tests')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  return mkdtemp(join(parent, label))
}
function output() {
  let text = ''
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        text += String(chunk)
        callback()
      },
    }),
    text: () => text,
  }
}
async function batches(directory: string): Promise<unknown[]> {
  const result: unknown[] = []
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (file.isDirectory()) result.push(...(await batches(join(directory, file.name))))
    else if (file.name === 'entries.jsonl')
      result.push(
        ...(await readFile(join(directory, file.name), 'utf8'))
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line)),
      )
  }
  return result
}
describe('real interactive durable conversation', () => {
  it('HTTP 503 records a failed response but exits nonzero with a safe generic message', async () => {
    const root = await setup('http503-'),
      tls = await createLocalTls(join(root, 'tls')),
      data = join(root, 'data')
    tls.setMode('http503')
    const credential = Buffer.from('controlled-503-private-key')
    try {
      const demo = await openDemo(data, { multiplier: 1.1, reserveTokens: 256 }, credential, {
        developmentTransport: tls.developmentTransport,
      })
      const out = output()
      expect(
        await runInteractive(
          demo,
          Readable.from(['trigger failure\n', '/exit\n']),
          out.stream,
          false,
        ),
      ).toEqual({ complete: false, interrupted: false })
      expect(out.text()).toContain(
        'Model request failed; durable response recorded. No automatic retry.',
      )
      expect(out.text()).toContain('Closed after model failure.')
      expect(out.text()).toContain('Cumulative (incomplete): input 0 known + 1 unknown')
      expect(out.text()).toContain('actual USD 0 known + 1 unknown')
      expect(out.text()).not.toContain('Close incomplete')
      expect(out.text()).not.toContain('controlled failure')
      expect(out.text()).not.toContain(credential.toString())
      expect(tls.requests).toHaveLength(1)
      expect(tls.failures).toEqual([])
      const commits = await batches(join(data, 'session-logs'))
      const durable = JSON.stringify(commits)
      expect(durable.match(/"outcome":"failed"/gu)).toHaveLength(1)
      expect(durable).not.toContain('"type":"assistant"')
      expect((await demo.application.close()).complete).toBe(true)
    } finally {
      credential.fill(0)
      await tls.close()
    }
  })
  it('streams two turns, closes, and a new startup sends both prior pairs in the third turn', async () => {
    const root = await setup('multi-'),
      tls = await createLocalTls(join(root, 'tls')),
      data = join(root, 'data')
    tls.setMode('reasoning')
    const credential = Buffer.from('controlled-demo-private-key')
    try {
      const first = await openDemo(data, { multiplier: 1.1, reserveTokens: 256 }, credential, {
        developmentTransport: tls.developmentTransport,
      })
      const session = first.session,
        out = output()
      const result = await runInteractive(
        first,
        Readable.from(['first prompt\n', 'second prompt\n', '/history\n', '/exit\n']),
        out.stream,
        false,
      )
      expect(result).toEqual({ complete: true, interrupted: false })
      expect(out.text()).toContain('Assistant> first second')
      expect(out.text()).toContain('user: first prompt')
      expect(out.text()).toContain('assistant: first second')
      expect(out.text()).not.toContain('private reasoning')
      expect(out.text()).toContain(
        'Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117',
      )
      expect(out.text()).toContain(
        'Cumulative: input 1e1, output 6, cache read 8, cache write 0 tokens; actual USD 234e-7',
      )
      expect(out.text().match(/Cumulative:/gu)).toHaveLength(2)
      expect(out.text()).not.toContain(credential.toString())
      expect(tls.requests).toHaveLength(2)
      expect(tls.requests[1]?.body).toMatchObject({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'first prompt' }] },
          { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
          { role: 'user', content: [{ type: 'text', text: 'second prompt' }] },
        ],
      })
      const before = await batches(join(data, 'session-logs'))
      const paired = before.filter(batch => JSON.stringify(batch).includes('"type":"assistant"'))
      expect(paired).toHaveLength(2)
      expect(JSON.stringify(paired)).toContain('"kind":"thinking"')
      for (const batch of paired)
        expect(batch).toMatchObject({
          entries: [
            { payload: { value: { type: 'assistant' } } },
            { payload: { value: { outcome: 'complete', replyDisposition: 'persisted' } } },
          ],
        })
      const key = await readFile(join(data, 'model-key'))
      const resumed = await openDemo(data, { multiplier: 1.1, reserveTokens: 256 }, undefined, {
        developmentTransport: tls.developmentTransport,
      })
      expect(resumed.session).toBe(session)
      expect(await resumed.history()).toHaveLength(4)
      expect(await readFile(join(data, 'model-key'))).toEqual(key)
      const resumedOutput = output()
      expect(
        await runInteractive(
          resumed,
          Readable.from(['third prompt\n', '/exit\n']),
          resumedOutput.stream,
          false,
        ),
      ).toEqual({ complete: true, interrupted: false })
      expect(resumedOutput.text()).toContain(
        'Cumulative: input 15, output 9, cache read 12, cache write 0 tokens; actual USD 351e-7',
      )
      expect(resumedOutput.text().match(/Cumulative:/gu)).toHaveLength(1)
      expect(tls.requests[2]?.body).toMatchObject({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'first prompt' }] },
          { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
          { role: 'user', content: [{ type: 'text', text: 'second prompt' }] },
          { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
          { role: 'user', content: [{ type: 'text', text: 'third prompt' }] },
        ],
      })
      expect(tls.requests.map(request => request.authorization)).toEqual(
        Array(3).fill('Bearer controlled-demo-private-key'),
      )
      expect(tls.failures).toEqual([])
    } finally {
      credential.fill(0)
      await tls.close()
    }
  })
  it('system SIGINT stops a held actual TLS request and completes physical close', async () => {
    const root = await setup('interrupt-'),
      tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('hold')
    const credential = Buffer.from('controlled-stop-key'),
      input = new PassThrough(),
      out = output()
    try {
      const demo = await openDemo(
        join(root, 'data'),
        { multiplier: 1.1, reserveTokens: 256 },
        credential,
        {
          developmentTransport: tls.developmentTransport,
        },
      )
      const run = runInteractive(demo, input, out.stream, false)
      input.write('hold this request\n')
      await tls.contentSent.promise
      await expect.poll(() => out.text(), { timeout: 1000 }).toContain('Assistant> first ')
      process.emit('SIGINT')
      expect(await run).toEqual({ complete: true, interrupted: true })
      await tls.socketClosed.promise
      expect(tls.closedSockets()).toBeGreaterThan(0)
      expect(out.text()).toContain('Call settled without a conversation reply')
      expect(out.text()).not.toContain('Saved.')
      const closed = await batches(join(root, 'data/session-logs'))
      expect(JSON.stringify(closed)).toContain('"initiator":"run_cancelled"')
      expect(JSON.stringify(closed)).not.toContain('"type":"assistant"')
    } finally {
      input.destroy()
      credential.fill(0)
      await tls.close()
    }
  })
  it('SIGINT before the service send admits its host prevents a late physical call', async () => {
    const root = await setup('start-window-'),
      tls = await createLocalTls(join(root, 'tls'))
    const credential = Buffer.from('controlled-start-window-key'),
      input = new PassThrough(),
      out = output()
    const entered = latch(),
      resume = latch()
    try {
      const actual = await openDemo(
        join(root, 'data'),
        { multiplier: 1.1, reserveTokens: 256 },
        credential,
        {
          developmentTransport: tls.developmentTransport,
        },
      )
      const conversation = {
        ...actual,
        async send(text: string, callback: Parameters<typeof actual.send>[1]) {
          entered.release()
          await resume.promise
          return actual.send(text, callback)
        },
      }
      const run = runInteractive(conversation, input, out.stream, false)
      input.write('stopping while start is pending\n')
      await entered.promise
      process.emit('SIGINT')
      resume.release()
      expect(await run).toEqual({ complete: true, interrupted: true })
      expect(out.text()).toContain('Closed.')
      expect(out.text()).not.toContain('Saved.')
      const commits = await batches(join(root, 'data/session-logs'))
      expect(JSON.stringify(commits)).not.toContain('"type":"assistant"')
    } finally {
      resume.release()
      input.destroy()
      credential.fill(0)
      await tls.close()
    }
  })
  it('missing or invalid credentials cause no HTTP and never regenerate a completed deployment', async () => {
    const root = await setup('missing-'),
      tls = await createLocalTls(join(root, 'tls')),
      data = join(root, 'data')
    try {
      const demo = await openDemo(data, { multiplier: 1.1, reserveTokens: 256 }, undefined, {
          developmentTransport: tls.developmentTransport,
        }),
        out = output()
      expect(
        await runInteractive(demo, Readable.from(['unsent\n', '/exit\n']), out.stream, false),
      ).toEqual({ complete: true, interrupted: false })
      expect(out.text()).toContain('Request refused before sending')
      expect(tls.requests).toHaveLength(0)
      const key = await readFile(join(data, 'model-key'))
      await expect(
        openDemo(data, { multiplier: 1.1, reserveTokens: 256 }, Buffer.from('bad\nkey'), {
          developmentTransport: tls.developmentTransport,
        }),
      ).rejects.toThrow('printable ASCII')
      expect(await readFile(join(data, 'model-key'))).toEqual(key)
      expect(tls.requests).toHaveLength(0)
    } finally {
      await tls.close()
    }
  })
})
