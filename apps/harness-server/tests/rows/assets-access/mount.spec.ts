import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { assetsAccessRow } from '../../../src/rows/assets-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { SHELL, settledSession } from '../../governance/tenant-settings-support.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { until } from '../server-entry/support.ts'

type Reply = Readonly<{ status: number; json: unknown }>

function assets(tree: ReleaseTree, operation: string, body: unknown, messageId: string) {
  const text = JSON.stringify(body)
  return new Promise<Reply>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path: `/api/assets/v1/${operation}`,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text)),
          'omne-message-id': messageId,
        },
      },
      res => {
        let reply = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          reply += chunk
        })
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, json: JSON.parse(reply) as unknown }),
        )
      },
    )
    req.on('error', reject)
    req.end(text)
  })
}

type Frame = Readonly<{
  kind: string
  protocols?: readonly Readonly<{ name: string; major: number }>[]
}>

function openAvailability(port: number) {
  const frames: Frame[] = []
  let buffered = ''
  const body = '{}'
  const req = request({
    host: '127.0.0.1',
    port,
    method: 'POST',
    path: '/api/access/v1/availability',
    headers: {
      host: `127.0.0.1:${port}`,
      'content-type': 'application/json',
      'content-length': String(body.length),
      'omne-message-id': 'm-availability',
    },
  })
  req.on('response', res => {
    res.setEncoding('utf8')
    res.on('data', (chunk: string) => {
      buffered += chunk
      for (let end = buffered.indexOf('\n\n'); end !== -1; end = buffered.indexOf('\n\n')) {
        const block = buffered.slice(0, end)
        buffered = buffered.slice(end + 2)
        if (!block.startsWith('data: ')) continue
        const event = JSON.parse(block.slice('data: '.length)) as { kind: string; frame?: Frame }
        if (event.kind === 'frame' && event.frame !== undefined) frames.push(event.frame)
      }
    })
    res.on('error', () => {})
  })
  req.on('error', () => {})
  req.end(body)
  return { frames, close: () => req.destroy() }
}

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

describe('assets-access row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(assetsAccessRow)
    expect(declared?.row).toBe('assets-access')
    expect(declared?.manifest.injects).toEqual(['accessRegistry', 'principalIssuer'])
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it(
    'loads on the release tree, assets/v1 appears in availability, and a login sets and reads back a setting',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const availability = openAvailability(tree.port)
        try {
          await until(() => availability.frames.length >= 1, 'the snapshot', 10_000)
          expect(availability.frames[0]?.protocols).toContainEqual({ name: 'assets', major: 1 })
        } finally {
          availability.close()
        }
        await settledSession(tree, 'hello')
        const tenant = savedTenant(tree.home)
        const item = { tenant, asset: SHELL, item: 'invoke' }

        const before = await assets(tree, 'describe-setting', item, 'm-describe-1')
        expect(before).toMatchObject({
          status: 200,
          json: { outcome: 'succeeded', body: { item: { kind: 'permission', own: null } } },
        })
        const revision = (before.json as { body: { item: { revision: string } } }).body.item
          .revision

        const written = await assets(
          tree,
          'set-setting',
          {
            ...item,
            operation: 'set-shell-deny',
            expectedRevision: revision,
            value: { kind: 'permission', pick: 'deny' },
          },
          'm-set',
        )
        const next = String(Number(revision) + 1)
        expect(written).toMatchObject({
          status: 200,
          json: { outcome: 'succeeded', body: { revision: next } },
        })

        const after = await assets(tree, 'describe-setting', item, 'm-describe-2')
        expect(after).toMatchObject({
          status: 200,
          json: {
            outcome: 'succeeded',
            body: { item: { kind: 'permission', own: 'deny', revision: next } },
          },
        })

        const listed = await assets(
          tree,
          'list-settings',
          { tenant, after: null, limit: 100 },
          'm-list',
        )
        expect(listed).toMatchObject({ status: 200, json: { outcome: 'succeeded' } })

        const foreign = await assets(
          tree,
          'describe-setting',
          { ...item, tenant: foreignTenant(tenant) },
          'm-foreign',
        )
        expect(foreign.json).toMatchObject({ outcome: 'denied' })
      })
      expect(exitCode).toBe(0)
    },
  )
})
