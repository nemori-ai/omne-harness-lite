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
