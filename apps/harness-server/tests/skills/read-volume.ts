import { performance } from 'node:perf_hooks'
import { skillsWorld } from './world.ts'

const COUNT = Number(process.argv[2] ?? 200)
const VERBS = ['Writes', 'Checks', 'Collects', 'Formats', 'Reviews']
const NOUNS = [
  'the weekly report',
  'the release notes',
  'a changelog',
  'the test plan',
  'an incident summary',
]

const world = await skillsWorld()
async function measure(label: string, command: string, params: object): Promise<void> {
  const reads = world.reads()
  const started = performance.now()
  const text = await world.call(command, params)
  const ms = performance.now() - started
  const head = text.split('\n')[0]
  console.log(
    `${label}: ${ms.toFixed(1)} ms, ${String(world.reads() - reads)} storage reads, ${String(Buffer.byteLength(text))} bytes; ${head}`,
  )
}
try {
  for (let i = 0; i < COUNT; i += 1)
    await world.publish(
      `skill-${String(i).padStart(3, '0')}`,
      `${VERBS[i % VERBS.length]} ${NOUNS[Math.floor(i / VERBS.length) % NOUNS.length]} for team ${String(i)}.`,
    )
  console.log(`one tenant, ${String(COUNT)} published and held Skills`)
  await measure('first call (opens the Skill set)', 'search', { query: '' })
  await measure('empty query', 'search', { query: '' })
  await measure('worded query "weekly report"', 'search', { query: 'weekly report' })
} finally {
  await world.close()
}
