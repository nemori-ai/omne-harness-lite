// Rough regex reading: Cordis injection edges between members, and how many of them are also import edges.
// Usage: node inject-import-overlap.mjs <repo-root> [--list]
// Scope: packages/*/*/src and apps/*/src, non-test .ts files. Not a parser: multi-line forms are matched with
// lazy whitespace, constants resolve by name across the whole workspace, unresolved names are printed.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.argv[2] ?? '.'
const list = process.argv.includes('--list')

const members = []
for (const top of ['packages', 'apps']) {
  const base = join(root, top)
  for (const a of readdirSync(base)) {
    if (!statSync(join(base, a)).isDirectory()) continue
    const dirs = top === 'apps' ? [join(base, a)] : readdirSync(join(base, a)).map((b) => join(base, a, b))
    for (const dir of dirs) {
      if (!statSync(dir).isDirectory() || !existsSync(join(dir, 'package.json'))) continue
      const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name
      members.push({ id: relative(root, dir), name })
    }
  }
}
const byName = new Map(members.map((m) => [m.name, m.id]))

const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) return walk(p)
        return /\.ts$/.test(f) && !/\.(spec|test)\.ts$/.test(f) && !/\.d\.ts$/.test(f) ? [p] : []
      })
    : []

const sources = members.map((m) => ({ ...m, files: walk(join(root, m.id, 'src')).map((p) => readFileSync(p, 'utf8')) }))

const constants = new Map() // NAME -> Set(value)
for (const m of sources)
  for (const text of m.files)
    for (const [, n, v] of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*(?::[^=\n]+)?=\s*['"]([^'"]+)['"]/g)) {
      if (!constants.has(n)) constants.set(n, new Set())
      constants.get(n).add(v)
    }

const unresolved = []
const keyOf = (token, where) => {
  const t = token.trim()
  const lit = t.match(/^['"]([^'"]+)['"]$/)
  if (lit) return lit[1]
  const values = constants.get(t)
  if (values && values.size === 1) return [...values][0]
  unresolved.push(`${where}: ${t}${values ? ` (${[...values].join('|')})` : ''}`)
  return undefined
}

const providers = new Map() // key -> Set(member)
const injects = [] // [consumer, key]
const imports = new Set() // "a -> b"
for (const m of sources)
  for (const text of m.files) {
    for (const [, tok] of text.matchAll(/ctx\.provide\(\s*([A-Za-z_][A-Za-z0-9_]*|'[^']+'|"[^"]+")/g)) {
      const k = keyOf(tok, `${m.id} provide`)
      if (k === undefined) continue
      if (!providers.has(k)) providers.set(k, new Set())
      providers.get(k).add(m.id)
    }
    for (const [, body] of text.matchAll(/\binject\s*[:=]\s*\[([^\]]*)\]/g))
      for (const tok of body.split(',').map((s) => s.trim()).filter(Boolean)) {
        const k = keyOf(tok, `${m.id} inject`)
        if (k !== undefined) injects.push([m.id, k])
      }
    for (const [, pkg] of text.matchAll(/(?:from|import\()\s*['"](@omne-harness-lite\/[^'"/]+)/g)) {
      const target = byName.get(pkg)
      if (target && target !== m.id) imports.add(`${m.id} -> ${target}`)
    }
  }

const pairs = new Set()
const noProvider = new Set()
for (const [consumer, key] of injects) {
  const ps = providers.get(key)
  if (!ps) { noProvider.add(`${consumer} needs '${key}'`); continue }
  for (const p of ps) if (p !== consumer) pairs.add(`${consumer} -> ${p}`)
}
const overlap = [...pairs].filter((p) => imports.has(p))

console.log(`members with src: ${sources.filter((m) => m.files.length).length}`)
console.log(`provided service keys: ${providers.size}`)
console.log(`inject entries: ${injects.length}`)
console.log(`injection member pairs: ${pairs.size}`)
console.log(`  of which also an import edge: ${overlap.length}`)
console.log(`  injected keys with no provider in src: ${noProvider.size}`)
console.log(`unresolved names: ${unresolved.length}`)
const multi = [...constants].filter(([, v]) => v.size > 1)
if (multi.length) console.log(`constants with several values: ${multi.map(([n, v]) => `${n}=${[...v].join('|')}`).join(', ')}`)
if (list) {
  for (const p of [...pairs].sort()) console.log(`${imports.has(p) ? 'IMPORT+INJECT' : 'INJECT only  '} ${p}`)
  for (const u of unresolved) console.log(`UNRESOLVED ${u}`)
  for (const n of noProvider) console.log(`NO PROVIDER ${n}`)
}
