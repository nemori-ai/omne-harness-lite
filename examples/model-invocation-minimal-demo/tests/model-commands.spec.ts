import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { openDemo } from '../src/demo.ts'
import { MODEL } from '../src/deployment.ts'
import { runInteractive } from '../src/interactive.ts'
import { createLocalTls } from './local-tls.ts'

const FLASH = 'deepseek/deepseek-v4.1-flash'

function capture() {
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

async function durableLog(directory: string): Promise<string> {
  let contents = ''
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, file.name)
    if (file.isDirectory()) contents += await durableLog(path)
    else if (file.name === 'entries.jsonl') contents += await readFile(path, 'utf8')
  }
  return contents
}

describe('interactive model commands on the real demo assembly', () => {
  it('closes the application when startup model status cannot be shown', async () => {
    const parent = resolve('tmp/model-request-runtime/model-commands-tests')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const root = await mkdtemp(join(parent, 'startup-failure-'))
    const tls = await createLocalTls(join(root, 'tls'))
    const credential = Buffer.from('controlled-startup-status-key')
    try {
      const actual = await openDemo(
        join(root, 'data'),
        { multiplier: 1.1, reserveTokens: 256 },
        16384,
        credential,
        { developmentTransport: tls.developmentTransport },
      )
      const close = vi.fn(actual.close)
      const output = capture()
      await expect(
        runInteractive(
          {
            ...actual,
            close,
            async currentModel() {
              throw new Error('controlled status read failure')
            },
          },
          Readable.from(['unsent prompt\n']),
          output.stream,
          false,
        ),
      ).rejects.toThrow('controlled status read failure')
      expect(close).toHaveBeenCalledOnce()
      expect(tls.requests).toHaveLength(0)
      expect(output.text()).toContain('Closed.')
    } finally {
      credential.fill(0)
      await tls.close()
    }
  })

  it('switches the same durable session while preserving history and request accounting', async () => {
    const parent = resolve('tmp/model-request-runtime/model-commands-tests')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const root = await mkdtemp(join(parent, 'switch-'))
    const tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('reasoning')
    const data = join(root, 'data')
    const credential = Buffer.from('controlled-model-commands-key')
    try {
      const first = await openDemo(
        data,
        { multiplier: 1.1, reserveTokens: 256 },
        16384,
        credential,
        {
          developmentTransport: tls.developmentTransport,
        },
      )
      const session = first.session
      const before = capture()
      expect(
        await runInteractive(
          first,
          Readable.from([
            '/help\n',
            '/models\n',
            '/model\n',
            'first prompt\n',
            `/model ${FLASH}\n`,
            '/model\n',
            '/model imaginary/model\n',
            '/model too many arguments\n',
            '/unknown\n',
            'second prompt\n',
            '/exit\n',
          ]),
          before.stream,
          false,
        ),
      ).toEqual({ complete: true, interrupted: false })
      expect(before.text()).toContain(`/model <identifier>`)
      expect(before.text()).toContain(`* ${MODEL} [official] legal`)
      expect(before.text()).toContain(`  ${FLASH} [official] legal`)
      expect(before.text()).toContain(`Selected: ${FLASH}`)
      expect(before.text()).toContain(`Effective: ${FLASH} (session, official)`)
      expect(before.text()).toContain('Model profile was not found.')
      expect(before.text()).toContain('Usage: /model <identifier>')
      expect(before.text()).toContain('Unknown command. Use /help.')
      expect(before.text().match(/Cumulative:/gu)).toHaveLength(2)
      expect(tls.requests).toHaveLength(2)
      expect(tls.requests.map(request => request.body)).toMatchObject([
        { model: MODEL, max_tokens: 16384 },
        {
          model: FLASH,
          max_tokens: 16384,
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'first prompt' }] },
            { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
            { role: 'user', content: [{ type: 'text', text: 'second prompt' }] },
          ],
        },
      ])
      const log = await durableLog(join(data, 'session-logs'))
      expect(log).toContain('model_selection_changed')
      expect(log).toContain(FLASH)
      expect(log.match(/model_selection_changed/gu)).toHaveLength(2)

      const reopened = await openDemo(
        data,
        { multiplier: 1.1, reserveTokens: 256 },
        8192,
        undefined,
        {
          developmentTransport: tls.developmentTransport,
        },
      )
      expect(reopened.session).toBe(session)
      const current = await reopened.currentModel()
      expect(current).toMatchObject({
        effectiveModel: { selected: FLASH, routeName: FLASH, selectedBy: 'session' },
      })
      expect(tls.requests).toHaveLength(2)
      const after = capture()
      expect(
        await runInteractive(
          reopened,
          Readable.from(['/models\n', '/model\n', 'third prompt\n', '/exit\n']),
          after.stream,
          false,
        ),
      ).toEqual({ complete: true, interrupted: false })
      expect(after.text()).toContain(`* ${FLASH} [official] legal`)
      expect(after.text()).toContain('Cumulative: input 15, output 9')
      expect(tls.requests).toHaveLength(3)
      expect(tls.requests[2]?.body).toMatchObject({
        model: FLASH,
        max_tokens: 8192,
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'first prompt' }] },
          { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
          { role: 'user', content: [{ type: 'text', text: 'second prompt' }] },
          { role: 'assistant', content: 'first second', reasoning: 'private reasoning' },
          { role: 'user', content: [{ type: 'text', text: 'third prompt' }] },
        ],
      })
      expect(tls.failures).toEqual([])
    } finally {
      credential.fill(0)
      await tls.close()
    }
  })
})
