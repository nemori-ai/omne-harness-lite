// W4-E 工程记录里的关联号能不能被「手上有 AccountId 的人」对上号。
//   node log-correlation.mjs <evidence dir>
// 从 transcript/*.jsonl 的线上答复里收集 AccountId 与 TenantId（线上看得见的、非秘密的身份值），
// 按 packages/tenancy/governance-center-entry/src/routing/record.ts 的做法 `hex(SHA-256(标签 ‖ 0x00 ‖ 输入))` 算关联号
// （标签是源码里的公开常量；租户的输入是 identity-values 的规范 JSON：先 organization 后 account），再数 output/center/*.jsonl 与 output/manual/center.stderr.jsonl
// 里的关联号有几个对得上。这只核「知道 AccountId 的人能否把记录对到那个账号」，不判它是否违反产品正文——那归主线。
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (root === undefined) {
  process.stderr.write('usage: node log-correlation.mjs <evidence dir>\n')
  process.exit(2)
}
const ACCOUNT_LABEL = 'omne.governance-center-entry.account-correlation.v1'
const TENANT_LABEL = 'omne.governance-center-entry.tenant-correlation.v1'
const correlation = (label, input) =>
  createHash('sha256').update(label, 'utf8').update(Buffer.of(0)).update(input, 'utf8').digest('hex')

const accounts = new Set()
const tenants = new Set()
for (const file of readdirSync(join(root, 'transcript'))) {
  for (const line of readFileSync(join(root, 'transcript', file), 'utf8').split('\n')) {
    if (line === '') continue
    const body = JSON.parse(line).answer.masked
    for (const m of body.matchAll(/"(?:account|invitedAccount)":"([a-z2-7]{26})"/g)) accounts.add(m[1])
    for (const m of body.matchAll(/\{"organization":"([a-z2-7]{26})","account":"([a-z2-7]{26})"\}/g)) {
      accounts.add(m[2])
      tenants.add(JSON.stringify({ organization: m[1], account: m[2] }))
    }
  }
}

const logFiles = readdirSync(join(root, 'output', 'center')).map(f => join(root, 'output', 'center', f))
const manual = join(root, 'output', 'manual', 'center.stderr.jsonl')
if (existsSync(manual)) logFiles.push(manual)
const logs = logFiles.map(f => readFileSync(f, 'utf8')).join('\n')
const accountNumbers = new Set([...logs.matchAll(/\\"account\\":\\"([0-9a-f]{64})\\"/g)].map(m => m[1]))
const tenantNumbers = new Set([...logs.matchAll(/\\"tenant\\":\\"([0-9a-f]{64})\\"/g)].map(m => m[1]))
const linkedAccounts = [...accounts].filter(a => accountNumbers.has(correlation(ACCOUNT_LABEL, a)))
const linkedTenants = [...tenants].filter(t => tenantNumbers.has(correlation(TENANT_LABEL, t)))
const requestLines = logs.split('\n').filter(l => l.includes('\\"account\\":\\"')).length

process.stdout.write(
  [
    `engineering-record files: ${logFiles.length}; request records carrying an account correlation number: ${requestLines}`,
    `distinct account correlation numbers in the records: ${accountNumbers.size}; distinct tenant correlation numbers: ${tenantNumbers.size}`,
    `AccountIds seen in wire answers: ${accounts.size}; of these, whose SHA-256(label || 0x00 || AccountId) is in the records: ${linkedAccounts.length}`,
    `TenantIds seen in wire answers: ${tenants.size}; of these, whose SHA-256(label || 0x00 || canonical TenantId) is in the records: ${linkedTenants.length}`,
    `record account numbers not linked to a wire AccountId: ${accountNumbers.size - new Set(linkedAccounts.map(a => correlation(ACCOUNT_LABEL, a))).size}`,
    '',
  ].join('\n'),
)
