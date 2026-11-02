// 慢层用例的子进程：在给定状态根与存储根上装真实的存储行，`write` 模式建一个会话，`read` 模式读回。
// 结果以一行 JSON 写到 stdout；关闭报告也在里面。用 Node 原生的类型剥离直接运行。
import { parseArgs } from 'node:util'
import type { SessionTransactionPort } from '@omne-harness/session-contract'
import { sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import type { TenantDomainLookup } from '@omne-harness/sql-contract'
import { tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { TENANT_A, access, createCommand, createGuards, loadStorageTree, textOf } from './tree.ts'

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
} else {
  outcome = await transactions.readWork(access(TENANT_A, 's1'))
}
const after = await lookup.lookup({ tenant: textOf(TENANT_A) })
const asked = tree.check.controls.asked().map(request => request.operation)
const report = await tree.shutdown()
process.stdout.write(
  `${JSON.stringify({ started: true, mode, before, outcome, after, asked, report })}\n`,
)
process.exit(report.overall === 'settled' ? 0 : 5)
