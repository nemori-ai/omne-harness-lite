// A real entry for the client core's tests in `packages/access/sdk` (#1249 C13, C14). The SDK may
// not import server-entry (rule `sdk-not-server`), so its tests start this file as a process:
//   node --conditions=source tests/fixtures/entry-peer.ts
// It prints one JSON line per event on stdout and stops when stdin closes:
//   {"port":N}                 listening, with notes/v1 and the built-in access/v1 mounted
//   {"called":"save-note"}     the save-note handler started; it never answers
//   {"opened":"watch-all"}     the frame source of watch-all was called
//   {"aborted":"watch-all"}    the frame source of watch-all saw its abort
// `watch-note` gives three frames and ends with `note-deleted`; `watch-all` gives one and waits.
import { startAccessFixture } from '../support/pipeline-kit.ts'

const line = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

const fixture = await startAccessFixture()
const { notes } = fixture
notes.scripts['save-note'] = async () => {
  line({ called: 'save-note' })
  return new Promise(() => {})
}
notes.sources['watch-note'] = async context => ({
  outcome: 'succeeded',
  frames: (async function* () {
    for (let tick = 1; tick <= 3 && !context.signal.aborted; tick += 1) {
      await new Promise(resolve => setTimeout(resolve, 10))
      yield { noteId: 'n-1', title: `tick ${tick}` }
    }
    return 'note-deleted'
  })(),
})
notes.sources['watch-all'] = async context => {
  line({ opened: 'watch-all' })
  context.signal.addEventListener('abort', () => line({ aborted: 'watch-all' }))
  return {
    outcome: 'succeeded',
    frames: (async function* () {
      yield { noteId: 'n-0', title: 'ready' }
      await new Promise(resolve => context.signal.addEventListener('abort', resolve))
      return 'unavailable'
    })(),
  }
}
line({ port: fixture.port })
process.stdin.resume()
process.stdin.on('end', () => {
  void fixture.stop().then(() => process.exit(0))
})
