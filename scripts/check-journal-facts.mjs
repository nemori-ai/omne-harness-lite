#!/usr/bin/env node
// Journal 事实体守卫：扫测试世界生成的库里 `er_fact.body`，里面出现内容类型的判别键（`role`、`content`、
// `messages`、`system`）就判红。Journal 的事实只存引用、摘要和小值；这些键说明有 `Message`、模型请求或
// 工具请求的内容被整份拷进了事实体，违背「Journal 自有部分不含日志或生产者已有内容」。
//
// 用法：
//   node scripts/check-journal-facts.mjs [库文件或目录 ...]
// 不给参数时扫 `tmp/journal-facts/`，那是 harness-server 的 journal-bytes 用例跑完世界后留下的库副本。
//
// 退出码：0 通过或跳过；1 发现违规；2 库打不开或用法错误。
// 跳过要说明原因：没有库，或库里没有 `er_fact` 表（终态 Journal provider 合入之前，事实还不是一行一条；
// R2-D294）。跳过不是通过：输出里写明「skipped」。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

/** 内容类型的判别键。键名整词相等才算，`contentDigest` 这类不算。 */
export const CONTENT_KEYS = Object.freeze(['role', 'content', 'messages', 'system'])

/** 默认扫的目录，相对仓库根。 */
export const DEFAULT_DIRECTORY = 'tmp/journal-facts'

/** 在解析后的 JSON 值里找判别键，返回带路径的命中。 */
export function findContentKeys(value, path = '$') {
  const hits = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...findContentKeys(item, `${path}[${index}]`)))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, member] of Object.entries(value)) {
      if (CONTENT_KEYS.includes(key)) hits.push(`${path}.${key}`)
      hits.push(...findContentKeys(member, `${path}.${key}`))
    }
  }
  return hits
}

/**
 * 扫一个库。返回 `{ kind: 'skipped', reason }` 或 `{ kind: 'scanned', rows, violations }`。
 * `body` 不是合法 JSON 也算违规：守卫读不懂的事实体不能当作干净。
 */
export function scanDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const table = db
      .prepare("select name from sqlite_master where type = 'table' and name = 'er_fact'")
      .get()
    if (table === undefined)
      return {
        kind: 'skipped',
        reason: 'no er_fact table (the final Journal provider has not landed, R2-D294)',
      }
    const violations = []
    let rows = 0
    for (const row of db.prepare('select pub, ord, kind, body from er_fact').iterate()) {
      rows += 1
      const where = `pub=${row.pub} ord=${row.ord} kind=${row.kind}`
      let parsed
      try {
        parsed = JSON.parse(
          typeof row.body === 'string' ? row.body : Buffer.from(row.body).toString('utf8'),
        )
      } catch {
        violations.push(`${where}: body is not JSON`)
        continue
      }
      for (const hit of findContentKeys(parsed)) violations.push(`${where}: content key at ${hit}`)
    }
    return { kind: 'scanned', rows, violations }
  } finally {
    db.close()
  }
}

/** 把参数展开成库文件：目录取其中的 `.sqlite`。 */
export function databasesOf(paths) {
  const files = []
  for (const path of paths) {
    if (!existsSync(path)) continue
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort())
        if (name.endsWith('.sqlite')) files.push(join(path, name))
    } else {
      files.push(path)
    }
  }
  return files
}

export function main(argv, log = console.log) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const given = argv.length > 0
  const paths = given ? argv : [join(root, DEFAULT_DIRECTORY)]
  const missing = given ? paths.filter(path => !existsSync(path)) : []
  if (missing.length > 0) {
    log(`check-journal-facts: not found: ${missing.join(', ')}`)
    return 2
  }
  const files = databasesOf(paths)
  if (files.length === 0) {
    log(`check-journal-facts: skipped, no world database under ${paths.join(', ')}`)
    return 0
  }
  let red = false
  for (const file of files) {
    let result
    try {
      result = scanDatabase(file)
    } catch (error) {
      log(
        `check-journal-facts: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return 2
    }
    if (result.kind === 'skipped') {
      log(`check-journal-facts: skipped ${file}: ${result.reason}`)
      continue
    }
    if (result.violations.length === 0) {
      log(`check-journal-facts: ok ${file} (${result.rows} fact rows)`)
      continue
    }
    red = true
    log(`check-journal-facts: RED ${file}: ${result.violations.length} violation(s)`)
    for (const violation of result.violations.slice(0, 20)) log(`  ${violation}`)
  }
  return red ? 1 : 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
