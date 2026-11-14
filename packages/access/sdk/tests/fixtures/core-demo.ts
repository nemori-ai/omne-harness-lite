// From packages/access/sdk: `pnpm run build && node tests/fixtures/core-demo.ts <server origin>`.
// No `--conditions=source`: under it eventsource-parser exports TypeScript, which Node cannot run.
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { PROOF, notesProtocol } from '../support/notes-protocol.ts'
import { startPeer } from '../support/peer.ts'

const say = (line = ''): void => console.log(line)
const origin = process.argv[2]

if (origin === undefined) {
  say('== part 1 skipped: give the origin of a running server, for example http://127.0.0.1:8787')
} else {
  say(`== part 1: the availability of ${origin}, without a login`)
  const access = createClient(accessProtocol, createHttpProtocolTransport({ origin }))
  const controller = new AbortController()
  const frames = access.observe.availability({}, { signal: controller.signal })
  const first = await frames.next()
  say(`frame: ${JSON.stringify(first.value)}`)
  controller.abort()
  say(`then, after the abort: ${JSON.stringify((await frames.next()).value)}`)
}
say()

say('== part 2: a call to the test entry, then to the same address after it stopped')
const entry = await startPeer()
const notes = createClient(
  notesProtocol,
  createHttpProtocolTransport({ origin: entry.origin, credentials: () => ({ proof: PROOF }) }),
)
say(`entry at ${entry.origin}`)
say(`read-note: ${JSON.stringify(await notes['read-note']({ noteId: 'n-1' }))}`)
await entry.stop()
say('entry stopped')
say(`read-note: ${JSON.stringify(await notes['read-note']({ noteId: 'n-1' }))}`)
