// 慢层用例的子进程：在给定状态根与存储根上装真实的存储行，`write` 模式建一个会话，`read` 模式读回。
// 结果以一行 JSON 写到 stdout；关闭报告也在里面。用 Node 原生的类型剥离直接运行。
import { parseArgs } from 'node:util'
import { referenceSystemActionAuthorization } from '@omne-harness/authorization'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import type { SessionTransactionPort } from '@omne-harness/session-contract'
import { sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import type { TenantDomainLookup } from '@omne-harness/sql-contract'
import { tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { createTenantEnumeration } from '../../../../src/rows/session-storage/enumeration.ts'
import { openTenantDirectory } from '../../../../src/rows/session-storage/directory.ts'
import {
  TENANT_A,
  TENANT_B,
  access,
  createCommand,
  createGuards,
  loadStorageTree,
  textOf,
} from './tree.ts'

const { values } = parseArgs({
  options: {
    'state-root': { type: 'string' },
    'storage-root': { type: 'string' },
    mode: { type: 'string' },
  },
})
const stateRoot = values['state-root']
const storageRoot = values['storage-root']
const mode = values.mode
if (stateRoot === undefined || storageRoot === undefined || (mode !== 'write' && mode !== 'read'))
  throw new Error('usage: child.ts --state-root <dir> --storage-root <dir> --mode write|read')

const tree = await loadStorageTree({
  stateRoot,
  storageRoot,
  directoryFile: `${storageRoot}/tenant-domains.json`,
})
if (tree.result.kind !== 'started') {
  process.stdout.write(`${JSON.stringify({ started: false, result: tree.result })}\n`)
  await tree.dispose()
  process.exit(4)
}
const transactions = tree.service<SessionTransactionPort<string>>(sessionTransactionsKey)
const lookup = tree.trusted<TenantDomainLookup>(tenantDomainLookupKey)
const before = await lookup.lookup({ tenant: textOf(TENANT_A) })
let outcome: unknown
if (mode === 'write') {
  const command = createCommand(TENANT_A, 's1')
  outcome = await transactions.commit({
    access: access(TENANT_A, 's1'),
    command,
    guards: createGuards(command),
  })
  const second = createCommand(TENANT_B, 's2')
  const written = await transactions.commit({
    access: access(TENANT_B, 's2'),
    command: second,
    guards: createGuards(second),
  })
  if (!('ok' in written)) throw new Error('second tenant write failed')
} else {
  outcome = await transactions.readWork(access(TENANT_A, 's1'))
}
const after = await lookup.lookup({ tenant: textOf(TENANT_A) })
const asked = tree.check.controls.asked().map(request => request.operation)
const report = await tree.shutdown()
// The persistence/restart probe uses the real identity authority with an explicit test grant.
// The release grant and entry factory are checked in the parent assembly after C-AUTH arrives.
const authority = inProcessPrincipalAuthority()
const issued = authority.issuer.issueSystem({ component: 'test-directory-scanner' })
if (!('ok' in issued)) throw new Error('principal issuance failed')
const directory = openTenantDirectory({
  file: `${storageRoot}/tenant-domains.json`,
  register: async () => {
    throw new Error('read probe must not register')
  },
})
const enumeration = createTenantEnumeration(
  referenceSystemActionAuthorization({
    verifier: authority.verifier,
    grants: {
      read: async () => ({
        kind: 'found',
        grant: {
          source: 'test',
          record: 'scanner',
          revision: '1',
          generation: '1',
          revoked: false,
          purposes: ['enumerate-tenants'],
        },
      }),
    },
    clock: null,
  }),
  directory.access,
)
const listing = await enumeration.enumerate({ principal: issued.ok })
const denied = await createTenantEnumeration(
  referenceSystemActionAuthorization({
    verifier: authority.verifier,
    grants: { read: async () => ({ kind: 'none' }) },
    clock: null,
  }),
  directory.access,
).enumerate({ principal: issued.ok })
process.stdout.write(
  `${JSON.stringify({ started: true, mode, before, outcome, after, asked, report, listing, denied })}\n`,
)
process.exit(report.overall === 'settled' ? 0 : 5)
