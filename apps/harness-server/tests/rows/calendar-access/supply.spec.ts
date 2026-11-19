// @module-tag slow
import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; json: any }>

function call(tree: ReleaseTree, operation: string, body: unknown) {
  const text = JSON.stringify(body)
  return new Promise<Reply>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path: `/api/calendar/v1/${operation}`,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text)),
          'omne-message-id': `m-${operation}-${Math.random()}`,
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

async function until(read: () => Promise<Reply>, done: (reply: Reply) => boolean) {
  const end = Date.now() + 60_000
  for (;;) {
    const reply = await read()
    if (done(reply) || Date.now() > end) return reply
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

describe('calendar supply on the release tree', () => {
  it(
    'follows the sources from the start, says which fail and why, keeps answering, and answers on a named calendar and version',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await tree.startSession('hello')
        const tenant = savedTenant(tree.home)
        // Tests point every source at a closed loopback port: each network source fails at once.
        const health = await until(
          () => call(tree, 'read-supply-health', { tenant }),
          reply =>
            reply.json.outcome === 'succeeded' &&
            reply.json.body.calendars.every((item: any) => item.supply === 'failed'),
        )
        expect(health.json.outcome).toBe('succeeded')
        expect(
          health.json.body.calendars.map((item: any) => [item.calendar, item.supply, item.horizon]),
        ).toEqual([
          ['cn-legal-holidays', 'failed', 'ok'],
          ['jp-legal-holidays', 'failed', 'ok'],
          ['us-federal-holidays', 'failed', 'ok'],
        ])
        for (const item of health.json.body.calendars) {
          expect(item.queryAvailability).toBe('available')
          expect(item.coverageEnd).not.toBeNull()
          const failed = item.sources.filter((source: any) => source.observation === 'failed')
          expect(failed.length).toBeGreaterThan(0)
          for (const source of failed) expect(source.reason).toEqual(expect.any(String))
        }
        const day = await call(tree, 'answer', {
          tenant,
          question: { kind: 'day', date: '2026-10-01' },
        })
        expect(day.json).toMatchObject({
          outcome: 'succeeded',
          body: { calendar: 'cn-legal-holidays' },
        })

        const listed = await call(tree, 'list-calendars', { tenant })
        const japan = listed.json.body.calendars.find(
          (item: any) => item.calendar === 'jp-legal-holidays',
        )
        const named = await call(tree, 'answer', {
          tenant,
          question: { kind: 'day', date: '2026-11-03' },
          calendar: 'jp-legal-holidays',
          version: japan.version,
        })
        expect(named.json).toMatchObject({
          outcome: 'succeeded',
          body: {
            calendar: 'jp-legal-holidays',
            version: japan.version,
            result: { kind: 'day', classification: 'holiday' },
          },
        })
        expect(
          await call(tree, 'answer', {
            tenant,
            question: { kind: 'day', date: '2026-11-03' },
            calendar: 'jp-legal-holidays',
            version: 'no-such-version',
          }),
        ).toMatchObject({ json: { outcome: 'unsupported', body: { reason: 'coverage' } } })
        expect(
          await call(tree, 'answer', {
            tenant,
            question: { kind: 'day', date: '2026-11-03' },
            version: japan.version,
          }),
        ).toMatchObject({ json: { outcome: 'invalid', body: { reason: 'input' } } })
        expect(
          await call(tree, 'answer', {
            tenant,
            question: { kind: 'day', date: '2026-11-03' },
            calendar: 'xx-nowhere',
          }),
        ).toMatchObject({ json: { outcome: 'denied' } })
      })
      expect(exitCode).toBe(0)
    },
  )
})
