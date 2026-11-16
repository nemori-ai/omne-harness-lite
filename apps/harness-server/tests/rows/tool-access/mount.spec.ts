import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { sessionCallControlRow } from '../../../src/rows/session-call-control/index.ts'
import { toolAccessConfig, toolAccessRow } from '../../../src/rows/tool-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; json: { outcome: string; body?: unknown } }>
type CallView = Readonly<{
  phase: string
  relation: string
  result: string | null
  terminal: { kind: string } | null
}>

async function post(
  tree: ReleaseTree,
  path: string,
  body: unknown,
  proof?: string,
): Promise<Reply> {
  const response = await fetch(`http://127.0.0.1:${String(tree.port)}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${proof ?? savedLoginProof(tree.home)}`,
      'omne-message-id': `m-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: (await response.json()) as Reply['json'] }
}

const WAIT = JSON.stringify({
  command: 'execute',
  params: {
    script: 'while [ ! -f go-bg ]; do sleep 0.1; done; echo bg-done',
    run_in_background: true,
  },
})

describe('tool-access and session-call-control rows', () => {
  it('declare the manifests of the stub table', () => {
    const access = rowDeclarationOf(toolAccessRow)
    expect(access?.manifest.injects).toEqual(['accessRegistry', 'principalIssuer'])
    expect(rowManifests.get(access!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
    const control = rowDeclarationOf(sessionCallControlRow)
    expect(control?.manifest.provides).toEqual(['sessionCallControl'])
    expect(toolAccessConfig.safeParse({ extra: 1 }).success).toBe(false)
  })

  it(
    'a one-shot Shell command runs in the background; tool/v1 reads it by reference and refuses every other reference alike',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const script = toolCallsThenText(body =>
        body.includes('start: background wait')
          ? [{ id: 'call_bg', tool: 'Shell', arguments: WAIT }]
          : [],
      )
      const exitCode = await onReleaseTree(
        {
          script,
          permission: 'bypass-permissions',
          extraHistoryKinds: ['message.system_reminder'],
        },
        async tree => {
          const tenant = savedTenant(tree.home)
          const session = await tree.startSession('start: background wait')
          const listed = await pollUntil(
            'the call to go to the background',
            () => post(tree, '/api/session/v1/list-background-calls', { tenant, session }),
            reply => (reply.json.body as { calls?: unknown[] } | undefined)?.calls?.length === 1,
          )
          const producer = (listed.json.body as { calls: { producer: { call: string } }[] })
            .calls[0]?.producer
          if (producer === undefined) throw new Error('no background call listed')
          const read = (reference: string, proof?: string) =>
            post(tree, '/api/tool/v1/read-call', { tenant, reference }, proof)
          const running = await read(producer.call)
          expect(running.json.outcome).toBe('succeeded')
          expect((running.json.body as { call: CallView }).call).toMatchObject({
            relation: 'background',
            terminal: null,
          })

          const refusals = await Promise.all([
            read(producer.call.replace(/"[^"]*"\]$/u, '"op-never"]')),
            read('not-a-reference'),
            post(tree, '/api/tool/v1/read-call-result', {
              tenant,
              reference: producer.call,
              result: 'no-such-version',
              cursor: null,
            }),
          ])
          for (const refusal of refusals)
            expect(refusal).toEqual({ status: 403, json: { outcome: 'denied', body: {} } })
          expect(await read(producer.call, 'forged')).toMatchObject({
            status: 403,
            json: { outcome: 'denied' },
          })

          writeFileSync(join(dirname(tree.storageRoot), 'workspace', 'go-bg'), '')
          const settled = await pollUntil(
            'the background call to settle',
            () => read(producer.call),
            reply =>
              (reply.json.body as { call?: CallView } | undefined)?.call?.phase === 'settled',
          )
          expect((settled.json.body as { call: CallView }).call).toMatchObject({
            relation: 'background',
            terminal: { kind: 'completed' },
          })
          // The reminder joins the Run still going, or wakes a follow-up Run once that one ended.
          const entries = await pollUntil(
            'the reminder and a Run that took it',
            () => historyOf(tree, session),
            value => {
              const at = value.findIndex(entry => entry.kind === 'message.system_reminder')
              return at >= 0 && value.slice(at).some(entry => entry.kind === 'run.terminal')
            },
          )
          const reminder = entries.find(entry => entry.kind === 'message.system_reminder')
          expect(JSON.stringify(reminder?.payload)).toContain('bg-done')
          const after = await post(tree, '/api/session/v1/list-background-calls', {
            tenant,
            session,
          })
          expect(after.json).toEqual({ outcome: 'succeeded', body: { calls: [] } })
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
