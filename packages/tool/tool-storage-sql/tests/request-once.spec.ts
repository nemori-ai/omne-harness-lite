// @module-tag slow
import { randomBytes } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CALL_RECORD_KEY } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { expect, it } from 'vitest'
import { domainNameOf, openApp, TENANT_A } from './fixtures/app.ts'
import { ledgerWorld } from './fixtures/ledger.ts'
import { settledOffloaded } from './fixtures/settled-offloaded.ts'

const MAX_COMMAND_BYTES = 1_048_576

const argumentsOf = (bytes: number) =>
  JSON.stringify({ text: randomBytes(bytes / 2).toString('hex') })

async function withApp<T>(run: (app: Awaited<ReturnType<typeof openApp>>) => Promise<T>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-request-once-')))
  const app = await openApp({ directory: root, maxCommandBytes: MAX_COMMAND_BYTES, keep: true })
  try {
    return await run(app)
  } finally {
    app.close()
    await rm(root, { recursive: true, force: true })
  }
}

it(
  'settles a call whose two argument texts nearly fill one command',
  () =>
    withApp(async app => {
      const text = argumentsOf(480_000)
      const live = await settledOffloaded(app, TENANT_A, 'done', text)
      expect(live.value.content).toMatchObject([{ kind: 'text', text: 'done' }])
      const fixed = app.sqlite.inspect(
        domainNameOf(TENANT_A),
        'SELECT key, length(fixed) AS bytes FROM tl_record WHERE fixed IS NOT NULL',
      )
      expect(fixed).toHaveLength(1)
      expect(fixed[0]?.['key']).toBe('call')
      expect(Number(fixed[0]?.['bytes'])).toBeGreaterThan(400_000)
      const largest = app.sqlite.inspect(
        domainNameOf(TENANT_A),
        'SELECT MAX(length(record)) AS bytes FROM tl_record',
      )
      expect(Number(largest[0]?.['bytes'])).toBeLessThan(32_768)
      const read = await app.store.read({ kind: 'call', tenant: TENANT_A, call: live.access.call })
      if (read.kind !== 'complete') throw new Error('ledger read incomplete')
      const call = read.records.find(record => record.kind === 'call')
      if (call?.kind !== 'call') throw new Error('missing call record')
      expect(call.call.request.arguments.effective).toBe(text)
    }),
  60_000,
)

it(
  'refuses at admission a request that one command cannot carry, and stores nothing of it',
  () =>
    withApp(async app => {
      const world = await ledgerWorld(TENANT_A, undefined, argumentsOf(600_000))
      const ledger = world.ledgerOver(app.store)
      expect(await ledger.admissions.admit(world.input)).toMatchObject({
        failure: { kind: 'invalid', field: 'storage' },
      })
      expect(
        app.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT COUNT(*) AS n FROM tl_record'),
      ).toEqual([{ n: 0n }])
    }),
  60_000,
)

it(
  'writes the request with a call record that first appears after the domain was committed',
  () =>
    withApp(async app => {
      const world = await ledgerWorld(TENANT_A)
      const ledger = world.ledgerOver(app.store)
      expect(await ledger.admissions.admit(world.input)).toHaveProperty('ok')
      const source = { kind: 'call', tenant: TENANT_A, call: world.access.call } as const
      const admitted = await app.store.readRecord(source, CALL_RECORD_KEY)
      if (admitted.kind !== 'complete' || admitted.record === null)
        throw new Error('no call record')
      const other = decodeToolCallId('request-once-late')
      if (!('ok' in other)) throw new Error('invalid fixture call')
      const domain = { kind: 'call', tenant: TENANT_A, call: other.ok } as const
      const revision = (text: string) => {
        const decoded = decodeToolRevision(text)
        if (!('ok' in decoded)) throw new Error('invalid fixture revision')
        return decoded.ok
      }
      expect(
        await app.store.commit({
          domain,
          expected: revision('0'),
          revision: revision('1'),
          writes: [],
        }),
      ).toEqual({ kind: 'committed' })
      expect(
        await app.store.commit({
          domain,
          expected: revision('1'),
          revision: revision('2'),
          writes: [{ kind: 'put', record: admitted.record }],
        }),
      ).toEqual({ kind: 'committed' })
      const late = await app.store.readRecord(domain, CALL_RECORD_KEY)
      expect(late).toMatchObject({ kind: 'complete', record: admitted.record })
    }),
  60_000,
)
