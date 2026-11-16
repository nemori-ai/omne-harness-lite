import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import { createHttpProtocolTransport } from '@omne-harness/sdk/core'
import {
  connectionPlugin,
  defineProtocolClient,
  protocolServiceName,
} from '@omne-harness/client-assembly/cordis'
import { startPeer, type Peer } from './support/peer.ts'

const empty = ruleCodec({ kind: 'object', fields: {} })
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
      outcomes: { succeeded: note, 'not-found': empty },
    },
  },
  observations: {},
})
const SERVICE = protocolServiceName({ name: 'notes', major: 1 })

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function until(ready: () => boolean): Promise<void> {
  while (!ready()) await new Promise(resolve => setTimeout(resolve, 10))
}

it('the protocol client appears while the entry has the protocol mounted, and goes when it is taken down', async () => {
  const entry: Peer = await startPeer()
  cleanups.push(() => entry.stop())
  const root = new Context()
  cleanups.push(() => root.fiber.dispose())
  const transport = createHttpProtocolTransport({
    origin: entry.origin,
    credentials: () => ({ proof: 'proof-alice-7f3c' }),
  })
  await root.plugin(
    connectionPlugin({ transport, login: { state: () => 'signed-in', subscribe: () => () => {} } }),
  )
  await root.plugin(defineProtocolClient(notesProtocol))
  await until(() => root.get(SERVICE) !== undefined)
  const notes = root.get(SERVICE) as { 'read-note': (body: unknown) => Promise<unknown> }
  expect(await notes['read-note']({ noteId: 'n-1' })).toEqual({
    outcome: 'succeeded',
    body: { noteId: 'n-1', title: 'first note' },
  })
  entry.send('take-down')
  await until(() => root.get(SERVICE) === undefined)
  expect(await notes['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'unavailable' })
  entry.send('mount')
  await until(() => root.get(SERVICE) !== undefined)
})
