// @module-tag slow
import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; json: any }>

function call(tree: ReleaseTree, operation: string, body: unknown, proof?: string) {
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
          authorization: `Bearer ${proof ?? savedLoginProof(tree.home)}`,
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

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

describe('calendar and calendar-access rows', () => {
  it(
    'answer date questions offline on the release tree with their calendar basis, read the timezone the CLI set, and refuse another tenant and a bad login',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await tree.startSession('hello')
        const tenant = savedTenant(tree.home)
        const listed = await call(tree, 'list-calendars', { tenant })
        expect(listed.json).toMatchObject({ outcome: 'succeeded' })
        expect(
          listed.json.body.calendars.map((value: { calendar: string }) => value.calendar),
        ).toEqual(['cn-legal-holidays', 'jp-legal-holidays', 'us-federal-holidays'])
        expect(await call(tree, 'read-environment', { tenant })).toMatchObject({
          json: {
            outcome: 'succeeded',
            body: { calendar: 'cn-legal-holidays', timezone: 'Asia/Shanghai' },
          },
        })
        const independentList = await tree.cli(['setting', 'list', '--independent'])
        expect(independentList.status, independentList.stderr).toBe(0)
        const groups = new Set(
          (
            independentList.result?.['body'] as {
              items: { owner: { providerId: string; definitionId: string } }[]
            }
          ).items.map(item => `${item.owner.providerId}/${item.owner.definitionId}`),
        )
        expect([...groups].sort()).toEqual(['calendar/environment', 'schedule/agent-authoring'])
        const environment = ['--independent', 'calendar/environment', 'timezone']
        const set = await tree.cli(['setting', 'set', ...environment, '--value', '"Europe/Paris"'])
        expect(set.status, set.stderr).toBe(0)
        const shown = await tree.cli(['setting', 'show', ...environment, '--json'])
        expect(shown.status, shown.stderr).toBe(0)
        expect(shown.result).toMatchObject({
          outcome: 'succeeded',
          body: {
            item: {
              owner: { kind: 'independent', providerId: 'calendar', definitionId: 'environment' },
              own: { kind: 'set', value: 'Europe/Paris' },
            },
          },
        })
        expect(await call(tree, 'read-environment', { tenant })).toMatchObject({
          json: {
            outcome: 'succeeded',
            body: { calendar: 'cn-legal-holidays', timezone: 'Europe/Paris' },
          },
        })
        const makeUp = await call(tree, 'answer', {
          tenant,
          question: { kind: 'day', date: '2026-10-10' },
        })
        expect(makeUp.json).toMatchObject({
          outcome: 'succeeded',
          body: {
            calendar: 'cn-legal-holidays',
            version: expect.any(String),
            coverageStart: expect.any(String),
            coverageEnd: expect.any(String),
            result: { kind: 'day', classification: 'workingDay', working: true, adjusted: true },
          },
        })
        expect(
          (
            await call(tree, 'answer', {
              tenant,
              question: { kind: 'count', from: '2026-09-28', to: '2026-10-09' },
            })
          ).json.body.result,
        ).toEqual({ kind: 'count', from: '2026-09-28', to: '2026-10-09', count: 5 })
        expect(
          (
            await call(tree, 'answer', {
              tenant: foreignTenant(tenant),
              question: { kind: 'day', date: '2026-10-10' },
            })
          ).json,
        ).toMatchObject({ outcome: 'denied' })
        const forged = await call(
          tree,
          'answer',
          { tenant, question: { kind: 'day', date: '2026-10-10' } },
          'not-a-login-proof',
        )
        expect(forged.json).toEqual({ outcome: 'denied', body: {} })
      })
      expect(exitCode).toBe(0)
    },
  )
})
