// @module-tag slow
import { request } from 'node:http'
import { runtimeContextTenantScopeKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { tenantScopeIssuerOf } from '../../../src/entry/principals.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; json: any }>

function call(tree: ReleaseTree, path: string, body: unknown) {
  const text = JSON.stringify(body)
  return new Promise<Reply>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text)),
          'omne-message-id': `m-${Math.random()}`,
        },
      },
      res => {
        let reply = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          reply += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(reply) }))
      },
    )
    req.on('error', reject)
    req.end(text)
  })
}

/** Reads Notification's need through the tenant-level scope: the standing items open now. */
async function standingItems(tree: ReleaseTree): Promise<any> {
  const { tenant } = tree.registrar()
  const principal = tenantScopeIssuerOf(tree.env)(tenant)
  const scope = tree.scope.get(runtimeContextTenantScopeKey)
  if (principal === undefined || scope === undefined) return { failure: 'no reader' }
  return scope.read(principal, tenant, {
    consumer: 'coordinator',
    blocks: [],
    needs: ['notification.standing-items'],
  })
}

async function calendarItems(tree: ReleaseTree): Promise<readonly any[]> {
  const read = await standingItems(tree)
  if ('failure' in read) return []
  return read.ok.entries
    .filter((entry: any) => entry.kind === 'value')
    .flatMap((entry: any) => entry.value)
    .filter((item: any) => item.source === 'calendar.supply')
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const end = Date.now() + 60_000
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() > end) return value
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

describe('the calendar-notification row', () => {
  it(
    'makes the calendar a notification source whose open supply risks Notification reads as standing items',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await tree.startSession('hello')
        const tenant = savedTenant(tree.home)
        const sources = await call(tree, '/api/notification/v1/list-sources', { tenant })
        const calendar = sources.json.body.sources.find(
          (source: any) => source.name === 'calendar.supply',
        )
        expect(calendar?.types.map((type: any) => [type.name, type.kind])).toEqual([
          ['coverage-warning', 'standing'],
          ['coverage-critical', 'standing'],
          ['supply-failing', 'standing'],
        ])
        // The sources point at a closed loopback port in tests, so every calendar's supply fails.
        const items = await until(
          () => calendarItems(tree),
          found => found.length === 3,
        )
        expect(items.map(item => item.id).sort()).toEqual([
          'calendar.supply/cn-legal-holidays/supply-failing',
          'calendar.supply/jp-legal-holidays/supply-failing',
          'calendar.supply/us-federal-holidays/supply-failing',
        ])
        const again = await calendarItems(tree)
        expect(again.map(item => item.id).sort()).toEqual(items.map(item => item.id).sort())
        const dates = await call(tree, '/api/calendar/v1/list-calendars', { tenant })
        expect(dates.json).toMatchObject({ outcome: 'succeeded' })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'leaves the calendar working and Notification without calendar items when the row is left out',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: toolCallsThenText(() => []), withoutRows: ['calendar-notification'] },
        async tree => {
          await tree.startSession('hello')
          const tenant = savedTenant(tree.home)
          const sources = await call(tree, '/api/notification/v1/list-sources', { tenant })
          expect(sources.json.body.sources.map((source: any) => source.name)).not.toContain(
            'calendar.supply',
          )
          expect(await calendarItems(tree)).toEqual([])
          const dates = await call(tree, '/api/calendar/v1/answer', {
            tenant,
            question: { kind: 'day', date: '2026-10-01' },
          })
          expect(dates.json).toMatchObject({ outcome: 'succeeded' })
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
