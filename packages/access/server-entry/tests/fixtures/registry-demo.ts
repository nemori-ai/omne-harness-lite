// The demonstration command of the access registry. From packages/access/server-entry run
//   node --conditions=source tests/fixtures/registry-demo.ts
// It prints a timeline: mount, the same protocol mounted again, a take-down while a call is in
// flight, and what a subscriber sees. It uses a test contribution that is in no release.
import { AccessAssemblyError } from '@omne-harness/access-cordis-contract'
import { createAccessRegistry } from '../../src/registry/registry.ts'
import { NOTES, notesContribution } from '../support/test-contribution.ts'

const say = (line: string): void => console.log(line)

const registry = createAccessRegistry()
const subscription = registry.subscribe(change =>
  say(
    `  subscriber: revision ${change.revision}, ${change.change} ${change.protocol.name}/v${change.protocol.major}`,
  ),
)
say(`subscribe: revision ${subscription.revision}, protocols [${subscription.protocols.length}]`)

say('mount notes/v1')
const takeDown = registry.mount(notesContribution('first'))

say('mount notes/v1 again')
try {
  registry.mount(notesContribution('second'))
} catch (error) {
  if (!(error instanceof AccessAssemblyError)) throw error
  say(`  ${error.name}: ${error.message}`)
}

const call = registry.enter(NOTES, 'save-note')
say(`enter notes/v1 save-note: ${call === undefined ? 'not mounted' : 'in flight'}`)
call?.signal.addEventListener('abort', () => say('  in-flight call: abort signal'))

say('take down notes/v1 while the call is in flight')
const drained = takeDown().then(() => say('  take-down complete'))
say(
  `  enter notes/v1 after take-down: ${registry.enter(NOTES, 'save-note') === undefined ? 'not mounted' : 'in flight'}`,
)
await Promise.resolve()
say('  the call answers and leaves')
call?.leave()
await drained
subscription.unsubscribe()
