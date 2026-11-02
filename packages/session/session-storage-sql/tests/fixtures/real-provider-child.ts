// Child process of the kill case. It opens the real provider on the root in argv[2], commits the
// `create` of one session, prints one line when the receipt came back, and then waits to be killed.
// It is run by plain `node` (type stripping), so it imports no vitest.
import { openRealApp, TENANT_A } from './real-provider.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: real-provider-child.ts <root>')
const app = await openRealApp({ root })
const result = await app.create(TENANT_A, 'session-1')
process.stdout.write(`RECEIPT ${'ok' in result ? 'ok' : 'failure'}\n`)
setInterval(() => undefined, 1000)
