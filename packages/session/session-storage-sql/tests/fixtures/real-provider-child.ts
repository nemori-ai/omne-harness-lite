// Child process of the kill cases. It opens the real provider on the root in argv[2] and commits one
// write: the `create` of one session (no argv[3]), or the preadmission intent of `handoff-1`
// (argv[3] is `preadmission`). It prints one line when the answer came back, and then waits to be
// killed. It is run by plain `node` (type stripping), so it imports no vitest.
import { decodePreadmissionReply, preadmissionFacts } from '../../src/participants.ts'
import { identityOf, openRealApp, preadmissionIntent, TENANT_A } from './real-provider.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: real-provider-child.ts <root> [preadmission]')
const app = await openRealApp({ root })
if (process.argv[3] === 'preadmission') {
  const result = await app.storage.commit({
    identity: identityOf(TENANT_A, app.domainOf(TENANT_A), 'preadmission-child'),
    ...app.combination,
    commands: [preadmissionFacts(preadmissionIntent())],
  })
  const reply = result.kind === 'committed' ? result.responses[0]?.reply : undefined
  process.stdout.write(
    `SAVED ${reply === undefined ? result.kind : decodePreadmissionReply(reply).kind}\n`,
  )
} else {
  const result = await app.create(TENANT_A, 'session-1')
  process.stdout.write(`RECEIPT ${'ok' in result ? 'ok' : 'failure'}\n`)
}
setInterval(() => undefined, 1000)
