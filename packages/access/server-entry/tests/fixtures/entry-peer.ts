import { createInterface } from 'node:readline'
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
let takeDown: (() => Promise<void>) | undefined = fixture.takeDown
line({ port: fixture.port })
const commands = createInterface({ input: process.stdin })
commands.on('line', command => {
  if (command === 'take-down' && takeDown !== undefined) {
    const done = takeDown()
    takeDown = undefined
    void done.then(() => line({ done: 'take-down' }))
  } else if (command === 'mount' && takeDown === undefined) {
    takeDown = fixture.log.registry.mount(notes.contribution)
    line({ done: 'mount' })
  }
})
commands.on('close', () => {
  void fixture.stop().then(() => process.exit(0))
})
