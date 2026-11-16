import { request } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  humanInterventionAccessConfig,
  humanInterventionAccessRow,
} from '../../../src/rows/human-intervention-access/index.ts'
import { HITL_LOCATION } from '../../../src/rows/tool-hitl/host.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { until } from '../../support/listening.ts'

type Reply = Readonly<{ status: number; json: any }>

function call(
  tree: ReleaseTree,
  operation: string,
  body: unknown,
  messageId: string,
  proof?: string,
) {
  const text = JSON.stringify(body)
  return new Promise<Reply>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path: `/api/human-intervention/v1/${operation}`,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          authorization: `Bearer ${proof ?? savedLoginProof(tree.home)}`,
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

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
    ],
  },
})

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

describe('human-intervention-access row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(humanInterventionAccessRow)
    expect(declared?.row).toBe('human-intervention-access')
    expect(declared?.manifest.injects).toEqual(['accessRegistry', 'principalIssuer'])
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it('takes the location reference as a non-empty text, defaulting to the one of the HITL host', () => {
    expect(humanInterventionAccessConfig.parse({})).toEqual({ locationRef: HITL_LOCATION })
    expect(humanInterventionAccessConfig.parse({ locationRef: 'elsewhere' })).toEqual({
      locationRef: 'elsewhere',
    })
    expect(humanInterventionAccessConfig.safeParse({ locationRef: '' }).success).toBe(false)
    expect(humanInterventionAccessConfig.safeParse({ locationRef: 7 }).success).toBe(false)
    expect(humanInterventionAccessConfig.safeParse({ other: 1 }).success).toBe(false)
  })

  it(
    'loads on the release tree, human-intervention/v1 appears in availability, and a login lists, reads and answers a card, then finds the answer again',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree(
        {
          script: toolCallsThenText(() => [{ id: 'call_ask', tool: 'Ask', arguments: ASK }]),
          permission: 'bypass-permissions',
        },
        async tree => {
          const availability = openAvailability(tree.port)
          try {
            await until(() => availability.frames.length >= 1, 'the snapshot', 10_000)
            expect(availability.frames[0]?.protocols).toContainEqual({
              name: 'human-intervention',
              major: 1,
            })
          } finally {
            availability.close()
          }
          const tenant = savedTenant(tree.home)
          const session = await tree.startSession('start: ask me')
          const list = {
            tenant,
            filter: { states: ['pending'], sessionRef: session },
            cursor: null,
            limit: 20,
          }

          let listed: Reply | undefined
          for (const end = Date.now() + 120_000; Date.now() < end; await sleep(500)) {
            listed = await call(tree, 'list-cards', list, 'm-list')
            if (listed.json.outcome === 'succeeded' && listed.json.body.items.length === 1) break
          }
          expect(listed).toMatchObject({ status: 200, json: { outcome: 'succeeded' } })
          const [first] = listed!.json.body.items as { card: { ref: unknown; revision: string } }[]
          expect(first?.card).toMatchObject({ kind: 'pending' })
          const card = first!.card.ref

          const read = await call(tree, 'read-card', { tenant, card }, 'm-read')
          expect(read).toMatchObject({
            status: 200,
            json: { outcome: 'succeeded', body: { item: first } },
          })

          const submission = {
            tenant,
            card,
            expectedRevision: first!.card.revision,
            reply: { kind: 'decline' },
            replyId: 'reply-1',
          }
          const before = await call(tree, 'query-submit-reply', submission, 'm-before')
          expect(before.json).toMatchObject({ outcome: 'unknown' })
          const submitted = await call(tree, 'submit-reply', submission, 'm-submit')
          expect(submitted).toMatchObject({ status: 200, json: { outcome: 'succeeded' } })
          const again = await call(tree, 'submit-reply', submission, 'm-submit-again')
          expect(again.json.body).toEqual(submitted.json.body)
          const found = await call(tree, 'query-submit-reply', submission, 'm-found')
          expect(found.json).toMatchObject({ outcome: 'succeeded', body: submitted.json.body })

          const foreign = await call(
            tree,
            'read-card',
            { tenant: foreignTenant(tenant), card },
            'm-foreign',
          )
          expect(foreign.json).toMatchObject({ outcome: 'denied' })
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
