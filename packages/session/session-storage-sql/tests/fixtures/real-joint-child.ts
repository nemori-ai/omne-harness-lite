import {
  guard,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  executionRecordFacts,
  sessionCommandFacts,
  sessionCommitCommands,
} from '../../src/participants.ts'
import { jointWrite, openRealApp, TENANT_A, identityOf } from './real-provider.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: real-joint-child.ts <root>')
const app = await openRealApp({ root })
const created = await app.create(TENANT_A, 'session-1')
if (!('ok' in created)) throw new Error('create failed')
const result = await app.storage.commit({
  identity: identityOf(TENANT_A, 'dom_0', 'aop_joint'),
  ...app.combination,
  commands: sessionCommitCommands([
    executionRecordFacts(jointWrite()),
    sessionCommandFacts(
      {
        kind: 'accept',
        input: {
          tenant: TENANT_A,
          session: sessionId('session-1'),
          operation: operationId('accept-joint'),
          value: ordinaryInput('joint'),
        },
      },
      [guard('login', 'login-entry', 'present')],
    ),
  ]),
})
process.stdout.write(`RECEIPT ${result.kind}\n`)
setInterval(() => undefined, 1000)
