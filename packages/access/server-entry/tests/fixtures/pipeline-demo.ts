import { createAccessRegistry } from '../../src/index.ts'
import { send, startFixture, type HttpReply } from '../support/harness.ts'
import {
  MESSAGE_ID,
  PROOF,
  TENANT,
  observe,
  scriptedNotes,
  testIdentity,
} from '../support/pipeline-kit.ts'

const serve = process.argv.includes('--serve')
const say = (line = ''): void => console.log(line)

const registry = createAccessRegistry()
const identity = testIdentity()
let notes = scriptedNotes()
let takeDown = registry.mount(notes.contribution)
const fixture = await startFixture({
  ...(serve ? { config: { heartbeatIntervalMs: 15_000 } } : {}),
  access: {
    registry,
    identity: identity.port,
    graceMs: 5000,
    frameQueueBytes: 1 << 20,
    availabilityBacklog: 64,
  },
})

type Request = Readonly<{
  path: string
  method?: string
  authorization?: string | undefined
  tenant?: string
  messageId?: string
  contentType?: string
  body: string
}>

function shown(body: string): string {
  if (body === '') return '(empty)'
  return body.length <= 80 ? body : `${body.slice(0, 40)}… (${Buffer.byteLength(body)} bytes)`
}

async function show(title: string, request: Request): Promise<HttpReply> {
  const headers: Record<string, string> = {}
  const lines: string[] = []
  const put = (name: string, value: string | undefined): void => {
    if (value === undefined) {
      lines.push(`  ${name}: (none)`)
      return
    }
    headers[name.toLowerCase()] = value
    lines.push(`  ${name}: ${value}`)
  }
  put('Authorization', request.authorization)
  put('Omne-Acting-Tenant', request.tenant)
  put('Omne-Message-Id', request.messageId)
  put('Content-Type', request.contentType)
  const reply = await send(fixture.port, request.path, {
    method: request.method ?? 'POST',
    headers,
    body: request.body,
  })
  say(`== ${title}`)
  say(`> ${request.method ?? 'POST'} ${request.path}`)
  for (const line of lines) say(line)
  say(`  body: ${shown(request.body)}`)
  say(`< ${reply.status}  Omne-Message-Id: ${reply.headers['omne-message-id'] ?? '(none)'}`)
  say(`  body: ${shown(reply.text)}`)
  say()
  return reply
}

const legal = (path: string, body: string, changes: Partial<Request> = {}): Request => ({
  path: `/api/notes/v1/${path}`,
  authorization: `Bearer ${PROOF}`,
  tenant: TENANT,
  messageId: MESSAGE_ID,
  contentType: 'application/json',
  body,
  ...changes,
})

say(`entry on 127.0.0.1:${fixture.port}; notes/v1 mounted; known proof: ${PROOF}`)
say()
await show('a legal call', legal('read-note', '{"noteId":"n-1"}'))
await show(
  'an address that is not mounted',
  legal('read-note', '{"noteId":"n-1"}', {
    path: '/api/other/v1/read-note',
  }),
)
await show('no login', legal('read-note', '{"noteId":"n-1"}', { authorization: undefined }))
const invalid = await show(
  'an invalid login',
  legal('read-note', '{"noteId":"n-1"}', { authorization: 'Bearer proof-unknown' }),
)
notes.scripts['read-note'] = async () => ({ outcome: 'denied' })
const refused = await show('the handler refuses', legal('read-note', '{"noteId":"n-1"}'))
delete notes.scripts['read-note']
say(
  `the two denied answers are the same bytes: ${
    invalid.status === refused.status && Buffer.from(invalid.body).equals(Buffer.from(refused.body))
  }`,
)
say()
await show(
  'a body over the limit of a small operation (maxBodyBytes.small = 2048)',
  legal('read-note', `{"noteId":"${'x'.repeat(3000)}"}`),
)
notes.scripts['read-note'] = async () => {
  throw new Error('read failed')
}
notes.scripts['save-note'] = async () => {
  throw new Error('commit failed')
}
await show('the handler of a read throws', legal('read-note', '{"noteId":"n-1"}'))
await show('the handler of a commit throws', legal('save-note', '{"noteId":"n-1","title":"t"}'))
delete notes.scripts['read-note']
delete notes.scripts['save-note']

const events = (client: ReturnType<typeof observe>): string =>
  client.chunks
    .join('')
    .split('\n\n')
    .filter(block => block !== '')
    .map(block => `  ${block}`)
    .join('\n')
say('== an observation: POST /api/notes/v1/watch-note with the same four headers')
const first = observe(fixture.port, 'watch-note')
say(
  `< ${await first.status}  content-type: ${(await first.headers)['content-type']}  Omne-Message-Id: ${(await first.headers)['omne-message-id']}`,
)
const feed = await notes.opened(1)
feed.push({ noteId: 'n-1', title: 'first frame' })
feed.push({ noteId: 'n-1', title: 'second frame' })
await first.waitForEvents(2)
say('  the frame source pushed two frames:')
say(events(first))
say()
say('== the same login opens the same message id again: the old stream is replaced')
const second = observe(fixture.port, 'watch-note')
await first.ended
say('  the old stream:')
say(events(first))
await notes.opened(2)
say()
await takeDown()
await second.ended
say(
  '-- notes/v1 taken down; the open observation got its ended frame before the take-down completed:',
)
say(events(second))
say()
await show('the same address after the take-down', legal('read-note', '{"noteId":"n-1"}'))

if (!serve) {
  await fixture.stop()
} else {
  notes = scriptedNotes()
  notes.sources['watch-note'] = async context => ({
    outcome: 'succeeded',
    frames: (async function* () {
      for (let tick = 1; tick <= 10 && !context.signal.aborted; tick += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        yield { noteId: 'n-1', title: `tick ${tick}` }
      }
      return 'note-deleted'
    })(),
  })
  takeDown = registry.mount(notes.contribution)
  const base = `http://127.0.0.1:${fixture.port}/api/notes/v1`
  const common = `-H 'Content-Type: application/json' -H 'Omne-Message-Id: m-1'`
  say(`notes/v1 mounted again; listening on 127.0.0.1:${fixture.port}. Ctrl+C stops.`)
  say(`known proofs: ${PROOF}, proof-bob-91aa; any non-empty tenant is accepted`)
  say()
  say(
    `curl -i ${base}/read-note -H 'Authorization: Bearer ${PROOF}' ${common} -d '{"noteId":"n-1"}'`,
  )
  say(
    `curl -i ${base}/save-note -H 'Authorization: Bearer ${PROOF}' -H 'Omne-Acting-Tenant: ${TENANT}' ${common} -d '{"noteId":"n-1","title":"t"}'`,
  )
  say(`curl -i ${base}/ping ${common} -d '{}'`)
  say(`curl -i ${base}/read-note ${common} -d '{"noteId":"n-1"}'`)
  say(
    `curl -N -i ${base}/watch-note -H 'Authorization: Bearer ${PROOF}' ${common} -d '{"noteId":"n-1"}'`,
  )
  say(
    '  (one frame a second, ended(note-deleted) after ten; run it twice to see observer-replaced;',
  )
  say('   Ctrl+C here stops the entry and an open stream gets ended(unavailable))')
  process.on('SIGINT', () => {
    void fixture.stop().then(() => process.exit(0))
  })
}
