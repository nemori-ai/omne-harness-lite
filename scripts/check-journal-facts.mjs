#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '../packages/storage/sql-contract/src/text-pack.ts'

export const CONTENT_KEYS = Object.freeze(['role', 'content', 'messages', 'system'])

export const DEFAULT_DIRECTORY = 'tmp/journal-facts'

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
        parsed = JSON.parse(unpackText(row.body))
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
