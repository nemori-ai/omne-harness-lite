// W4-A 独立核对（不经包内测试）：用入口层包**构建产物 dist/** 产出 https-json examples §1～§5 的答复字节，
// 并用包内实际使用的 ajv 校验器（加载包内 schema/ 副本）把入口契约 examples.md 的实例逐条求值。
// 用法：node produce.mjs <spoke 根> <输出目录> [改坏的 examples.md，仅测量自检用]
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [root, outDir, examplesOverride] = process.argv.slice(2)
if (root === undefined || outDir === undefined) throw new Error('usage: produce.mjs <root> <outDir>')
mkdirSync(outDir, { recursive: true })
const pkg = join(root, 'packages/tenancy/governance-center-entry')
const load = rel => import(pathToFileURL(join(pkg, 'dist', rel)).href)
const { entryAnswerBytes, publicHealthBytes, routeSuccessBytes } = await load('routing/answers.js')
const { routeFor } = await load('routing/routes.js')
const { fullHealthBody } = await load('ops/health.js')
const { responseBytes } = await load('ops/wire.js')
const { entryValidator } = await load('routing/schema.js')
const oe = await import(pathToFileURL(join(root, 'packages/core/offer-expiry/dist/index.js')).href)
const iv = await import(pathToFileURL(join(root, 'packages/core/identity-values/dist/index.js')).href)

const instant = ms => {
  const r = oe.instantFromEpochMs(ms)
  if (!iv.isOk(r)) throw new Error('not an instant')
  return r.ok
}
const CENTER_ID = '3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60'
const produced = {}
produced['1-version-mismatch'] = entryAnswerBytes('version-mismatch')
produced['2-public-health-reply'] = publicHealthBytes(CENTER_ID, '0.1.0')
produced['3.1-login-state-rejected'] = entryAnswerBytes('login-state-rejected')
produced['3.2-unavailable'] = entryAnswerBytes('unavailable')
produced['3.3-invalid-input'] = entryAnswerBytes('invalid-input')
const route = routeFor('capability.account-identity/v2#S-37')
const at = Date.UTC(2026, 8, 23, 8, 0, 0)
produced['4-route-result'] = routeSuccessBytes(
  route.toWire(
    [
      { loginStateId: 'b8f7117646179c7f8f923b56e9735b1a337d0cf67c7a5d63d3d2f4896ec0dd8e', issuedAt: at },
      { loginStateId: 'c3ff21f9237e63ee18a0748b3d2b963355c7a77e9269c186325ad75abccf87aa', issuedAt: at + 250 },
    ],
    {},
  ),
)
const body = await fullHealthBody(
  {
    storage: { read: async () => true, write: async () => { throw new Error('not used') } },
    clock: { now: () => instant(Date.UTC(2026, 8, 23, 9, 0, 0)) },
    deploymentKey: { present: true, complete: true },
    deploymentParameters: {
      unactivatedRetention: 604800000,
      invitationTtlDefault: 1209600000,
      affiliationRequestTtlDefault: 1209600000,
      copyNoticeTtlDefault: 604800000,
      sharingInvitationTtlDefault: 604800000,
    },
    reportProbeDefect: () => undefined,
  },
  { centerId: CENTER_ID, version: '0.1.0', startedAt: instant(Date.UTC(2026, 8, 23, 8, 0, 0)) },
  0,
)
produced['5-full-health'] = responseBytes(body)
for (const [name, bytes] of Object.entries(produced)) {
  writeFileSync(join(outDir, `${name}.bin`), bytes)
  console.log(`produced\t${name}\t${bytes.length}\t${createHash('sha256').update(bytes).digest('hex')}`)
}

// 入口契约 examples.md：每个「校验对象」下的表，第一列实例喂给包内校验器，比对第二列
// 第三个参数只给测量自检用：换一份故意改坏的 examples，确认本脚本会报 DISAGREE
const md = readFileSync(
  examplesOverride ??
    join(root, '.meta_harness/design/spec/compositions/governance-center-entry/v1/examples.md'),
  'utf8',
)
let def
let pass = 0
let fail = 0
const defs = new Set()
const splitRow = line => {
  // 表格按未转义的 | 切分；实例在第一列的行内代码里
  const cells = []
  let cur = ''
  let inCode = false
  for (let i = 1; i < line.length; i += 1) {
    const c = line[i]
    if (c === '`') inCode = !inCode
    if (c === '|' && !inCode && line[i - 1] !== '\\') {
      cells.push(cur.trim())
      cur = ''
    } else cur += c
  }
  return cells
}
for (const line of md.split('\n')) {
  const m = /^\*\*校验对象\*\*：`\$defs\/([A-Za-z0-9_]+)`$/.exec(line)
  if (m) {
    def = m[1]
    defs.add(def)
    continue
  }
  if (!line.startsWith('| `') || def === undefined) continue
  const cells = splitRow(line)
  const instanceText = cells[0].replace(/^`/, '').replace(/`$/, '')
  const expected = cells[1]
  if (expected !== '通过' && expected !== '拒绝') throw new Error(`unexpected expectation: ${line}`)
  const value = JSON.parse(instanceText)
  const ok = entryValidator(def)(value) === true
  const agree = ok === (expected === '通过')
  if (agree) pass += 1
  else fail += 1
  console.log(`example\t${agree ? 'agree' : 'DISAGREE'}\t${def}\t${expected}\t${ok ? 'valid' : 'invalid'}\t${instanceText}`)
}
console.log(`examples-summary\tdefs=${defs.size}\tagree=${pass}\tdisagree=${fail}`)
if (fail > 0 || pass === 0) process.exitCode = 1
