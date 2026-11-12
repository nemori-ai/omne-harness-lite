// The demonstration command of the client assembly (#1249 C18). From packages/access/client-assembly
//   pnpm run build && node tests/fixtures/assembly-demo.ts
// It starts server-entry's test entry, puts the connection and the notes protocol client on a
// client tree, and prints the tree's services as the entry takes notes/v1 down and mounts it again.
import { Context } from '@deepseek-ai/cordis'
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import { createHttpProtocolTransport } from '@omne-harness/sdk/core'
import {
  connectionPlugin,
  defineProtocolClient,
  protocolServiceName,
} from '@omne-harness/client-assembly/cordis'
import { startPeer } from '../support/peer.ts'

const noteRef = ruleCodec({ kind: 'object', fields: { noteId: { rule: { kind: 'text' } } } })
const note = ruleCodec({
  kind: 'object',
  fields: { noteId: { rule: { kind: 'text' } }, title: { rule: { kind: 'text' } } },
})
const notesProtocol = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    'read-note': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: noteRef,
      outcomes: { succeeded: note },
    },
  },
  observations: {},
})
const SERVICE = protocolServiceName({ name: 'notes', major: 1 })

const entry = await startPeer()
const root = new Context()
const transport = createHttpProtocolTransport({
  origin: entry.origin,
  credentials: () => ({ proof: 'proof-alice-7f3c' }),
})
await root.plugin(
  connectionPlugin({ transport, login: { state: () => 'signed-in', subscribe: () => () => {} } }),
)
await root.plugin(defineProtocolClient(notesProtocol))

const until = async (ready: () => boolean): Promise<void> => {
  while (!ready()) await new Promise(resolve => setTimeout(resolve, 10))
}
const show = (moment: string): void => {
  const open = [...root.get('connection')!.availability.current()].map(k => `${k.name}/v${k.major}`)
  const present = root.get(SERVICE) !== undefined
  console.log(`${moment}`)
  console.log(`  availability: ${open.join(', ')}`)
  console.log(`  ${SERVICE} on the tree: ${present ? 'yes' : 'no'}`)
}

console.log(`entry at ${entry.origin}`)
await until(() => root.get(SERVICE) !== undefined)
show('-- connected')
const notes = root.get(SERVICE) as { 'read-note': (body: unknown) => Promise<unknown> }
console.log(`  read-note: ${JSON.stringify(await notes['read-note']({ noteId: 'n-1' }))}`)
entry.send('take-down')
await until(() => root.get(SERVICE) === undefined)
show('-- the entry took notes/v1 down')
console.log(
  `  read-note through the old handle: ${JSON.stringify(await notes['read-note']({ noteId: 'n-1' }))}`,
)
entry.send('mount')
await until(() => root.get(SERVICE) !== undefined)
show('-- the entry mounted notes/v1 again')
await root.fiber.dispose()
await entry.stop()
