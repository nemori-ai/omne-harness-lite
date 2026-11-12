// The demonstration command of the access registry. From packages/access/server-entry run
//   node --conditions=source tests/fixtures/registry-demo.ts
// It prints a timeline: mount, the same protocol mounted again, a take-down while a call is in
// flight, a handler that ignores the abort and is answered after the grace, and what a subscriber
// sees. It uses a test contribution that is in no release and a clock it moves by hand.
import { AccessAssemblyError, type AccessContribution } from '@omne-harness/access-cordis-contract'
import { createAccessRegistry } from '../../src/registry/registry.ts'
import { settleCall } from '../../src/settle/settle.ts'
import { manualClock } from '../support/manual-clock.ts'
import { NOTES, notesContribution, type NotesProtocol } from '../support/test-contribution.ts'

const say = (line: string): void => console.log(line)
const limits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}
const GRACE_MS = 500
const clock = manualClock()

/** A contribution whose `save-note` handler returns only when `release` is called. */
function heldContribution(title: string): {
  contribution: AccessContribution<NotesProtocol>
  release: () => void
} {
  let release!: () => void
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  const base = notesContribution(title)
  return {
    contribution: {
      ...base,
      operations: {
        ...base.operations,
        'save-note': async call => {
          await released
          say(`  handler of ${title} returns (aborted: ${call.signal.aborted})`)
          return { outcome: 'succeeded', body: {} }
        },
      },
    },
    release,
  }
}

function settle(title: string) {
  const entered = registry.enter(NOTES, 'save-note')
  if (entered === undefined) throw new Error('notes/v1 is not mounted')
  say(`enter notes/v1 save-note (${title}): in flight`)
  return settleCall({
    entered: {
      ...entered,
      leave: () => {
        say(`  leave (${title})`)
        entered.leave()
      },
    },
    principal: undefined,
    messageId: title,
    body: { noteId: 'n-1', title: 'Plan' },
    limits,
    config: { graceMs: GRACE_MS },
    clock,
    respond: answer => say(`  answer (${title}): ${answer.outcome}`),
  })
}

const registry = createAccessRegistry()
const subscription = registry.subscribe(change =>
  say(
    `  subscriber: revision ${change.revision}, ${change.change} ${change.protocol.name}/v${change.protocol.major}`,
  ),
)
say(`subscribe: revision ${subscription.revision}, protocols [${subscription.protocols.length}]`)

say('— 1. mount, and mount the same protocol again')
const first = heldContribution('call A')
const takeDownFirst = registry.mount(first.contribution)
try {
  registry.mount(notesContribution('second'))
} catch (error) {
  if (!(error instanceof AccessAssemblyError)) throw error
  say(`  ${error.name}: ${error.message}`)
}

say('— 2. take down while a call is in flight; the handler honours the abort')
const callA = settle('call A')
const drainedFirst = takeDownFirst().then(() => say('  take-down of notes/v1 complete'))
say(
  `  enter after take-down: ${registry.enter(NOTES, 'save-note') === undefined ? 'not mounted' : 'in flight'}`,
)
first.release()
await callA
await drainedFirst

say(`— 3. a handler ignores the abort; the entry answers after the grace of ${GRACE_MS} ms`)
const stuck = heldContribution('call B')
const takeDownSecond = registry.mount(stuck.contribution)
const callB = settle('call B')
const drainedSecond = takeDownSecond().then(() => say('  take-down of notes/v1 complete'))
say(`  clock +${GRACE_MS - 1} ms`)
clock.advance(GRACE_MS - 1)
await new Promise<void>(resolve => setImmediate(resolve))
say(`  clock +1 ms`)
clock.advance(1)
await callB
await drainedSecond
stuck.release()
await new Promise<void>(resolve => setImmediate(resolve))
say('  (the late result of call B is discarded: no second answer)')

subscription.unsubscribe()
const final = registry.subscribe(() => undefined)
say(`— 4. a new subscriber sees revision ${final.revision}, protocols [${final.protocols.length}]`)
final.unsubscribe()
