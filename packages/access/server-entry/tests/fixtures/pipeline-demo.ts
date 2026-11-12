// The demonstration command of the new address (#1233 C14). From packages/access/server-entry run
//   node --conditions=source tests/fixtures/pipeline-demo.ts [--serve]
// It starts an entry given `access`, mounts the test protocol notes/v1 (in no release) and a test
// identity port, sends a series of requests and prints each request and answer. With --serve it
// mounts the protocol again afterwards, prints the port and curl commands to copy, and stays up
// until Ctrl+C.
import { createAccessRegistry } from '../../src/index.ts'
import { send, startFixture, type HttpReply } from '../support/harness.ts'
import { MESSAGE_ID, PROOF, TENANT, scriptedNotes, testIdentity } from '../support/pipeline-kit.ts'

const serve = process.argv.includes('--serve')
const say = (line = ''): void => console.log(line)

const registry = createAccessRegistry()
const identity = testIdentity()
let notes = scriptedNotes()
let takeDown = registry.mount(notes.contribution)
const fixture = await startFixture({
  access: { registry, identity: identity.port, graceMs: 5000 },
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

/** A long body is shown by its head and its size. */
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
await takeDown()
say('-- notes/v1 taken down')
say()
await show('the same address after the take-down', legal('read-note', '{"noteId":"n-1"}'))

if (!serve) {
  await fixture.stop()
} else {
  notes = scriptedNotes()
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
  say(`curl -i ${base}/watch-note -H 'Authorization: Bearer ${PROOF}' ${common} -d '{}'`)
  process.on('SIGINT', () => {
    void fixture.stop().then(() => process.exit(0))
  })
}
