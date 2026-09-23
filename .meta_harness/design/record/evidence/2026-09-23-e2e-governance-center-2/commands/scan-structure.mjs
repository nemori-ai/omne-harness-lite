// W4-E 与秘密值无关的结构核对：在一棵证据目录里找出所有带出示物或口令的 JSON 成员，看它们的值是不是遮蔽后的 `***`；
// 另数 PEM 私钥块的起始行（-----BEGIN … PRIVATE KEY-----），并列出「值像记号（≥20 个 base64url／十六进制字符）」的成员名，供人逐个判断有没有漏登记的秘密种类。
//   node scan-structure.mjs <dir>
// 不改任何文件；结果写到标准输出。遮蔽前的原文不在证据里，所以这一步只能看「出示物与口令所在的那几格是否都是 ***」，
// 不能替代用真实值的 grep。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.argv[2]
if (root === undefined) {
  process.stderr.write('usage: node scan-structure.mjs <dir>\n')
  process.exit(2)
}

function files(path) {
  if (statSync(path).isDirectory())
    return readdirSync(path).flatMap(entry => files(join(path, entry)))
  return [path]
}

const SECRET_MEMBERS = new Set(['loginState', 'presentedLoginState', 'credential'])
// 收尾的引号只看不吃：去掉转义层之后，外层字符串的开引号紧贴着内层第一个成员名的引号，吃掉会漏下一个成员
const member = /"([A-Za-z][A-Za-z0-9]*)":"([^"]*)(?=")/g
const tokenLike = /^[A-Za-z0-9_-]{20,}$/

const secretSlots = new Map() // name -> { total, masked, unmasked: [{file, value}] }
const tokenMembers = new Map() // name -> count
let privateKeyHeaders = 0
let scanned = 0

for (const file of files(root).sort()) {
  const raw = readFileSync(file, 'utf8')
  scanned++
  privateKeyHeaders += [...raw.matchAll(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g)].length
  // 转义层：transcript 里线上原文是 JSON 字符串里的字符串，commands 里还可能再套一层
  let text = raw
  for (let i = 0; i < 3; i++) text = text.replaceAll('\\"', '"').replaceAll('\\\\', '\\')
  for (const [, name, value] of text.matchAll(member)) {
    if (SECRET_MEMBERS.has(name)) {
      const slot = secretSlots.get(name) ?? { total: 0, masked: 0, unmasked: [] }
      slot.total++
      if (value === '***') slot.masked++
      else slot.unmasked.push({ file: relative(root, file), value })
      secretSlots.set(name, slot)
    } else if (tokenLike.test(value)) {
      tokenMembers.set(name, (tokenMembers.get(name) ?? 0) + 1)
    }
  }
}

const lines = [`root ${root}`, `files scanned: ${scanned}`, `PEM private-key blocks (-----BEGIN … PRIVATE KEY-----): ${privateKeyHeaders}`]
for (const name of [...SECRET_MEMBERS].sort()) {
  const slot = secretSlots.get(name) ?? { total: 0, masked: 0, unmasked: [] }
  lines.push(`member ${name}: ${slot.total} occurrences, ${slot.masked} masked as ***, ${slot.unmasked.length} not masked`)
  const distinct = new Map()
  for (const { file, value } of slot.unmasked) {
    const key = value
    const entry = distinct.get(key) ?? { count: 0, files: new Set() }
    entry.count++
    entry.files.add(file)
    distinct.set(key, entry)
  }
  for (const [value, { count, files: where }] of distinct)
    lines.push(`  not masked: ${JSON.stringify(value)} x${count} in ${[...where].join(', ')}`)
}
lines.push('members whose value looks like a token (>=20 base64url/hex chars), not in the secret set:')
for (const [name, count] of [...tokenMembers].sort()) lines.push(`  ${name}: ${count}`)
process.stdout.write(`${lines.join('\n')}\n`)
