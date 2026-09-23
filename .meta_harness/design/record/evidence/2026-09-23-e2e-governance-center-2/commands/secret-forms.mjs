// W4-E 独立秘密清单：不 import 套件的 evidence.ts，自己从私钥文件取片段并展开成五种形式，一行一个，写到标准输出。
//   node secret-forms.mjs <file|dir>...
// 目录递归；只取内容里含 "PRIVATE KEY" 的文件。片段：拼起来的 base64 正文、正文里每一行（≥16 字符）、
// 整份 PEM（只取它的 base64url／十六进制形式——原样多行 PEM 的每一行已在逐行片段里）。
// 形式：原样、base64url、base64url 带填充、十六进制小写、十六进制大写。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function files(path) {
  if (statSync(path).isDirectory())
    return readdirSync(path).flatMap(entry => files(join(path, entry)))
  return [path]
}

function forms(value) {
  const bytes = Buffer.from(value, 'utf8')
  const hex = bytes.toString('hex')
  return [
    value,
    bytes.toString('base64url'),
    bytes.toString('base64').replaceAll('+', '-').replaceAll('/', '_'),
    hex,
    hex.toUpperCase(),
  ]
}

const out = new Set()
let keyFiles = 0
for (const file of process.argv.slice(2).flatMap(files)) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (!text.includes('PRIVATE KEY')) continue
  keyFiles++
  const body = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('-----'))
  const fragments = [body.join(''), ...body.filter(line => line.length >= 16)]
  for (const fragment of fragments) for (const form of forms(fragment)) out.add(form)
  for (const form of forms(text.trim()).slice(1)) out.add(form)
}
process.stderr.write(`private-key files: ${keyFiles}; patterns: ${out.size}\n`)
process.stdout.write([...out].join('\n') + (out.size > 0 ? '\n' : ''))
