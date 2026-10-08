import { fixturePayload } from './log-payload-fixture.ts'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { openDemo } from '../src/demo.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'
import { readToolDriverHistory } from '../src/tool-driver-history.ts'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'

test(
  'application close waits for the actual admitted C batch before releasing its physical log owner',
  { tags: ['slow'], timeout: 120_000 },
  async () => {
    const parent = resolve('tmp/tool-runtime-loop/tool-demo-tests')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const root = await mkdtemp(join(parent, 'live-close-'))
    const tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('tool_nonce')
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    const demo = await openDemo(
      join(root, 'data'),
      { multiplier: 1.1, reserveTokens: 256 },
      demoRetirement(),
      16_384,
      Buffer.from('controlled-live-close-key'),
      {
        developmentTransport: tls.developmentTransport,
        hooks: {
          sessionLogOpened(log) {
            return {
              ...log,
              async append(...args) {
                if (
                  args[1].some(
                    entry => fixturePayload(entry.payload).value.kind === 'delivery_confirmed',
                  )
                ) {
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
      const sent = demo.send('Generate a nonce and report it.', async () => undefined)
      await Promise.race([
        entered.promise,
        sent.then(result => {
          throw new Error('turn ended before C: ' + JSON.stringify(result))
        }),
      ])
      let closed = false
      const closing = demo.application.close().then(result => {
        closed = true
        return result
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(await demo.application.createToolSession(demo.actor, 'after-close')).toMatchObject({
        kind: 'rejected',
      })
      release.resolve()
      await sent
      const result = await closing
      expect(result).toMatchObject({ complete: true })
      // Reacquire the actual physical owner after the application has released its lock.
      const physical = await openSqlLogFixture({ file: join(root, 'data', 'db.sqlite') })
      const session = unwrap(parseOpaqueIdentifier(demo.session, 'SessionRef'))
      const read = await physical.readSince(session, 0)
      await physical.close()
      if ('failure' in read) throw new Error('physical history unavailable')
      const scope = { tenant: demo.actor.tenant, session }
      const history = readToolDriverHistory({ scope, ownerGeneration: 'live-close-proof', ...read })
      if ('unavailable' in history) throw new Error('complete C was not recognized')
      const tools = projectToolJournal(scope, read.entries)
      if ('invalid' in tools) throw new Error('tool journal invalid')
      expect([...tools.executions.values()]).toHaveLength(1)
      expect([...tools.executions.values()][0]!.confirmed).toBeDefined()
      expect(
        history.models.entries.filter(entry => entry.captured.message?.type === 'tool'),
      ).toHaveLength(1)
    } finally {
      release.resolve()
      await demo.close()
      await tls.close()
    }
  },
)

test(
  'close recognizes the original complete denial batch after its receipt was lost and the business binding was revoked',
  { tags: ['slow'], timeout: 120_000 },
  async () => {
    const parent = resolve('tmp/tool-runtime-loop/tool-demo-tests')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const root = await mkdtemp(join(parent, 'denial-close-'))
    const tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('tool_nonce')
    let lost = false
    const demo = await openDemo(
      join(root, 'data'),
      { multiplier: 1.1, reserveTokens: 256 },
      demoRetirement(),
      16_384,
      Buffer.from('controlled-denial-close-key'),
      {
        developmentTransport: tls.developmentTransport,
        hooks: {
          async toolProvidersInstalled(providers) {
            await providers.officialAdmission.dispose()
          },
          sessionLogOpened(log) {
            return {
              ...log,
              async append(...args) {
                const denial = args[1].some(entry =>
                  entry.dedupeKey?.includes('tool-driver/1/["denied",'),
                )
                const result = await log.append(...args)
                if (denial && !lost && !('failure' in result)) {
                  lost = true
                  return { failure: 'unavailable' as const }
                }
                return result
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
      const sent = await demo.send('Generate a nonce and report it.', async () => undefined)
      expect(lost).toBe(true)
      expect(sent).toMatchObject({ kind: 'refused', reason: 'actions:unavailable' })
      expect(tls.requests).toHaveLength(1)
      expect(await demo.close()).toMatchObject({ complete: true })
      const physical = await openSqlLogFixture({ file: join(root, 'data', 'db.sqlite') })
      const session = unwrap(parseOpaqueIdentifier(demo.session, 'SessionRef'))
      const read = await physical.readSince(session, 0)
      await physical.close()
      if ('failure' in read) throw new Error('actual closed denial history unavailable')
      const history = readToolDriverHistory({
        scope: { tenant: demo.actor.tenant, session },
        ownerGeneration: 'denial-close-proof',
        ...read,
      })
      if ('unavailable' in history) throw new Error('actual denial batch not recognized')
      expect(
        history.models.entries.filter(entry => entry.captured.message?.type === 'tool'),
      ).toHaveLength(1)
      expect([...history.calls.values()].map(call => call.route.kind)).toEqual(['denial'])
      const actual = projectToolJournal(history.prefix.scope, history.prefix.entries)
      if ('invalid' in actual) throw new Error('actual tool journal invalid')
      expect(actual.executions.size).toBe(0)
    } finally {
      await demo.close()
      await tls.close()
    }
  },
)
