import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoConfig } from '../src/deployment.ts'
// @module-tag slow
// Real TLS model turns, SQL and a physical SQL journal owner exercise the managed tool subtree.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Fiber } from '@deepseek-ai/cordis'
import { expect, test, vi } from 'vitest'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { openDemo } from '../src/demo.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'

async function directory(name: string) {
  const parent = resolve('tmp/tool-runtime-loop/tool-managed-tests')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  return mkdtemp(join(parent, name))
}

test(
  'dynamic admission withdrawal preserves an already admitted actual tool terminal and C delivery',
  { timeout: 120_000 },
  async () => {
    const root = await directory('withdraw-'),
      tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('tool_nonce')
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    let publication: Fiber | undefined
    let held = false
    const demo = await openDemo(
      join(root, 'data'),
      { multiplier: 1.1, reserveTokens: 256 },
      demoRetirement(),
      16_384,
      Buffer.from('controlled-managed-key'),
      {
        developmentTransport: tls.developmentTransport,
        hooks: {
          toolProvidersInstalled(providers) {
            publication = providers.admissionPublication
          },
          sessionLogOpened(log) {
            return {
              ...log,
              async append(...args) {
                if (!held && args[1].some(entry => entry.dedupeKey?.includes('execution_ended'))) {
                  held = true
                  entered.resolve()
                  await release.promise
                }
                return log.append(...args)
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
      const turn = demo.send('Generate a nonce and report it.', async () => undefined)
      await Promise.race([
        entered.promise,
        turn.then(result => {
          throw new Error('Turn ended before actual A: ' + JSON.stringify(result))
        }),
      ])
      expect(publication).toBeDefined()
      await publication!.dispose()
      release.resolve()
      expect(await turn).toMatchObject({ kind: 'saved' })
      expect(tls.requests).toHaveLength(2)
      const body = tls.requests[1]!.body as { messages: { role: string; content: unknown }[] }
      expect(body.messages.find(message => message.role === 'tool')?.content).toMatch(
        /^[0-9a-f]{32}$/u,
      )
      expect(await demo.close()).toMatchObject({ complete: true })
    } finally {
      release.resolve()
      await demo.close()
      await tls.close()
    }
  },
)

test(
  'an unconfirmed environment retirement retains the original subtree and physical writer until explicit close retries',
  { timeout: 120_000 },
  async () => {
    const root = await directory('retained-'),
      data = join(root, 'data'),
      tls = await createLocalTls(join(root, 'tls'))
    let confirmed = false
    const retire = vi.fn(async () =>
      confirmed ? { kind: 'drained' as const } : { kind: 'pending' as const, resources: [] },
    )
    const demo = await openDemo(
      data,
      { multiplier: 1.1, reserveTokens: 256 },
      demoRetirement(),
      16_384,
      Buffer.from('controlled-managed-key'),
      {
        developmentTransport: tls.developmentTransport,
        hooks: {
          toolProvidersInstalled(providers) {
            providers.environments.registerProvider({
              name: 'controlled-original',
              generation: 'original-generation',
              retire,
              async describe() {
                return { kind: 'descriptions', values: [] }
              },
              async acquire() {
                return { kind: 'rejected', reason: 'noMatchingEnvironment' }
              },
              async recover() {
                return 'pending'
              },
            })
          },
        },
      },
      undefined,
      undefined,
      true,
    )
    try {
      expect(await demo.close()).toMatchObject({ complete: false })
      expect(retire).toHaveBeenCalledTimes(1)
      const competing = createAcceptanceApplication(
        createDemoConfig(
          data,
          'competing-retirement',
          () => new Date().toISOString(),
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
      expect(await demo.application.createToolSession(demo.actor, 'after-close')).toMatchObject({
        kind: 'rejected',
      })
      confirmed = true
      expect(await demo.close()).toMatchObject({ complete: true })
      expect(retire).toHaveBeenCalledTimes(2)
      const physical = await openSqlLogFixture({ file: join(data, 'db.sqlite') })
      await physical.close()
    } finally {
      confirmed = true
      await demo.close()
      await tls.close()
    }
  },
)

test(
  'failed result-root startup closes the already-created managed prefix and releases the actual writer',
  { timeout: 120_000 },
  async () => {
    const root = await directory('prefix-'),
      data = join(root, 'data'),
      tls = await createLocalTls(join(root, 'tls'))
    await mkdir(data, { mode: 0o700 })
    await writeFile(join(data, 'tool-results'), 'controlled-invalid-result-root', { mode: 0o600 })
    try {
      await expect(
        openDemo(
          data,
          { multiplier: 1.1, reserveTokens: 256 },
          demoRetirement(),
          16_384,
          Buffer.from('controlled-managed-key'),
          { developmentTransport: tls.developmentTransport },
          undefined,
          undefined,
          true,
        ),
      ).rejects.toThrow()
      expect(tls.requests).toHaveLength(0)
      const physical = await openSqlLogFixture({ file: join(data, 'db.sqlite') })
      await physical.close()
    } finally {
      await tls.close()
    }
  },
)
