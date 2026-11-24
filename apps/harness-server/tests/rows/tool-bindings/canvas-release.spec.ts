// @module-tag slow
import { describe, expect, it } from 'vitest'
import { CANVAS_POLICY, savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallFacts,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const canvasCall = (command: string, params: Record<string, unknown>) =>
  JSON.stringify({ command, params })
const app = (ref: string) => ({ kind: 'canvas.app', ref })

/** The tool results of a session once it has ended the given number of Runs. */
async function settled(tree: ReleaseTree, session: string, what: string, runs = 1) {
  const entries = await pollUntil(
    `the Run of ${what} to end`,
    () => historyOf(tree, session),
    value => value.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )
  return toolResults(entries).join('\n')
}

/** The person's side: canvas/v1 over HTTP with the login the tree saved. */
async function asPerson(tree: ReleaseTree, operation: string, body: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:${String(tree.port)}/api/canvas/v1/${operation}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${savedLoginProof(tree.home)}`,
      'omne-message-id': 'm-person',
    },
    body: JSON.stringify({ tenant: savedTenant(tree.home), canvas: 'main', ...body }),
  })
  return (await response.json()) as { outcome: string; body: Record<string, any> }
}
const itemsOf = async (tree: ReleaseTree) =>
  (await asPerson(tree, 'look', {})).body['items'] as Record<string, any>[]

/** What the agent tries on the item a person locked: the two lock commands, and three that move it. */
const LOCKED_CALLS = [
  ['call_unlock', 'unlock'],
  ['call_lock', 'lock'],
  ['call_move', 'arrange'],
  ['call_take', 'take'],
  ['call_pile', 'pile'],
] as const

describe('the Canvas tool on the release tree', () => {
  it(
    'places as the agent of its session, takes no identity from the model, and cannot undo what a person locked',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      let locked = ''
      const lockedCall = (command: string) =>
        canvasCall(
          command,
          command === 'arrange'
            ? { items: [{ item: locked, at: { x: 1600, y: 1600 } }] }
            : command === 'pile'
              ? { pile: 'p1', items: [locked] }
              : { items: [locked] },
        )
      const scripted = (body: string) => {
        const calls = [
          [
            'canvas: place',
            'call_place',
            canvasCall('place', { reference: app('clock'), at: { x: 80, y: 80 } }),
          ],
          [
            'canvas: forged',
            'call_forged',
            canvasCall('place', {
              reference: app('forged'),
              by: { kind: 'human' },
              tenant: 'another',
              session: 'another',
            }),
          ],
          ['canvas: look', 'call_look', canvasCall('look', {})],
          ...LOCKED_CALLS.map(([id, command]) => ['canvas: locked', id, lockedCall(command)]),
        ] as const
        return calls
          .filter(([asked, id]) => body.includes(asked) && !body.includes(id))
          .map(([, id, args]) => ({ id, tool: 'Canvas', arguments: args }))
      }
      let declared = false
      const script = toolCallsByRequest(body => {
        declared ||= body.includes('"name":"Canvas"')
        return scripted(body)
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await tree.startSession('canvas: place')
        expect(await settled(tree, session, 'place')).toContain('done Canvas place')
        expect(declared).toBe(true)
        const [placed, ...none] = await itemsOf(tree)
        expect(none).toEqual([])
        expect(placed).toMatchObject({
          reference: app('clock'),
          at: { x: 80, y: 80 },
          by: { kind: 'agent', session },
        })

        const forged = await settled(tree, await tree.startSession('canvas: forged'), 'forged')
        expect(forged).toContain('Canvas place: Unrecognized keys: "by", "tenant", "session"')
        expect(await itemsOf(tree)).toHaveLength(1)

        const looked = await settled(tree, await tree.startSession('canvas: look'), 'look')
        const [head, ...lines] = looked.split('\n')
        expect(head).toBe('done Canvas look')
        const byAgent = JSON.parse(lines.join('\n')) as Record<string, unknown>
        const { size, footprint } = CANVAS_POLICY
        expect(byAgent['sheet']).toEqual({ ...CANVAS_POLICY.sheet, size, footprint })
        expect(byAgent).toEqual((await asPerson(tree, 'look', {})).body)

        const put = await asPerson(tree, 'place', { reference: app('note'), at: { x: 800, y: 80 } })
        expect(put.outcome).toBe('succeeded')
        locked = put.body['item'].id
        const lock = await asPerson(tree, 'lock', { items: [locked], locked: true })
        expect(lock.outcome).toBe('succeeded')
        const before = await itemsOf(tree)

        const other = await tree.startSession('canvas: locked')
        const results = await settled(tree, other, 'locked')
        expect(results).not.toContain('done Canvas')
        const prohibited = 'The tool call was denied by a rule or a prohibition and did not run.'
        expect(results.split(prohibited)).toHaveLength(3)
        const refusal = `conflict locked item ${locked}: it is locked. A person has to unlock it`
        expect(results.split(refusal)).toHaveLength(4)
        expect(await itemsOf(tree)).toEqual(before)
        // The tool ledger holds the calls that reached Canvas: the three that move, never lock or unlock.
        const reached = [...toolCallFacts(tree.storageRoot).values()].map(
          facts => (JSON.parse(facts.arguments) as { command: string }).command,
        )
        expect(reached.filter(command => !['place', 'look'].includes(command)).sort()).toEqual([
          'arrange',
          'pile',
          'take',
        ])
      })
      expect(exitCode).toBe(0)
    },
  )
})
