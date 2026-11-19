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
  intent: 'test call',
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
    expect(control?.manifest.provides).toEqual([
      'sessionCallControl',
      'sessionCallStates',
      'sessionDerivedInputs',
    ])
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
          // Runtime context reminders are system reminders too; the call's own is the other one.
          const callReminder = (entry: { kind: string; payload?: unknown }) =>
            entry.kind === 'message.system_reminder' &&
            !JSON.stringify(entry.payload).includes('Runtime context')
          const entries = await pollUntil(
            'the reminder and a Run that took it',
            () => historyOf(tree, session),
            value => {
              const at = value.findIndex(callReminder)
              return at >= 0 && value.slice(at).some(entry => entry.kind === 'run.terminal')
            },
          )
          const reminder = entries.find(callReminder)
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

  it(
    'reads the output body of a running background command by position, and refuses other references alike (C9, C12, C13)',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const COUNT = JSON.stringify({
        command: 'execute',
        intent: 'count slowly',
        params: {
          script:
            'i=0; while [ ! -f go-count ]; do i=$((i+1)); echo line-$i; sleep 0.5; done; echo count-done',
          run_in_background: true,
        },
      })
      const script = toolCallsThenText(body =>
        body.includes('start: count')
          ? [{ id: 'call_count', tool: 'Shell', arguments: COUNT }]
          : [],
      )
      const exitCode = await onReleaseTree(
        { script, permission: 'bypass-permissions' },
        async tree => {
          const tenant = savedTenant(tree.home)
          const session = await tree.startSession('start: count')
          const listed = await pollUntil(
            'the call to go to the background',
            () => post(tree, '/api/session/v1/list-background-calls', { tenant, session }),
            reply => (reply.json.body as { calls?: unknown[] } | undefined)?.calls?.length === 1,
          )
          const reference = (listed.json.body as { calls: { producer: { call: string } }[] })
            .calls[0]?.producer.call
          if (reference === undefined) throw new Error('no background call listed')
          type Part = { kind: string; from?: string; through?: string; text?: string }
          const output = (after: string | null, ref = reference) =>
            post(tree, '/api/tool/v1/read-call-output', { tenant, reference: ref, after })
          const first = await pollUntil(
            'the output body to hold a few lines while the command runs',
            () => output(null),
            reply => ((reply.json.body as Part | undefined)?.text ?? '').includes('line-3'),
          )
          const part = first.json.body as Part
          expect(part).toMatchObject({ kind: 'open', from: '0' })
          const later = await pollUntil(
            'more output after the first part',
            () => output(part.through ?? '0'),
            reply => ((reply.json.body as Part | undefined)?.text ?? '') !== '',
          )
          const next = later.json.body as Part
          expect(next.from).toBe(part.through)
          expect(next.text).not.toContain('line-1\n')
          const cli = await tree.cli(['calls', 'output', '--call', reference])
          expect(cli.stdout).toContain('line-')
          expect(cli.stderr).toMatch(/open output; read on with --after \d+/u)

          const refusals = await Promise.all([
            output(null, reference.replace(/"[^"]*"\]$/u, '"op-never"]')),
            output(null, 'not-a-reference'),
          ])
          for (const refusal of refusals)
            expect(refusal).toEqual({ status: 403, json: { outcome: 'denied', body: {} } })

          writeFileSync(join(dirname(tree.storageRoot), 'workspace', 'go-count'), '')
          await pollUntil(
            'the sealed output body after the command ends',
            () => output('0'),
            reply => (reply.json.body as Part | undefined)?.kind === 'sealed',
          )
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
