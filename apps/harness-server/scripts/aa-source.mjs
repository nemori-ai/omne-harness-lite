// Source rules behind `check:aa-rows` (identity governance E1, E2): who may read a trusted name,
// and which files may call the principal issuer. Plain Node, no dependencies, no build step.
//
// E1. Every name in the trusted table of the assembly page is read in exactly two ways: through
//     `env.readTrusted(name)` in an entry object module, or inside a row the table lists as
//     visible for that name. So an entry module (`src/entry`) never calls `get`, `[]` or `ctx.name`
//     on a trusted name at the root, and a row source (`src/rows`) never mentions a trusted name
//     its row cannot see.
// E2. `issueActingForTenant(` and `issueSystem(` are called only from the files the config lists.
//
// Names the identity plan asks to become trusted but the table does not list yet (`pending`) are
// scanned with the same rules in report-only mode: the findings are the wiring work that the
// table change owes. A pending name that the table already lists is enforced like any other.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const posix = path => path.split('\\').join('/')

/**
 * Blank out comments and, unless `keep` allows them, the content of string and template
 * literals. Offsets and line breaks stay where they were. `keep` is `true` (keep every string) or
 * a set of exact string contents to keep. `${...}` inside a template stays code.
 */
function mask(text, keep = new Set()) {
  const keeps = content => keep === true || keep.has(content)
  const blankOf = s => s.replace(/[^\n]/g, ' ')
  let out = ''
  let i = 0
  let inTemplate = false
  const depth = []
  while (i < text.length) {
    const c = text[i]
    const d = text[i + 1]
    if (inTemplate) {
      if (c === '\\') {
        out += blankOf(text.slice(i, i + 2))
        i += 2
      } else if (c === '`') {
        out += c
        inTemplate = false
        i++
      } else if (c === '$' && d === '{') {
        out += '${'
        depth.push(0)
        inTemplate = false
        i += 2
      } else {
        out += c === '\n' ? c : ' '
        i++
      }
      continue
    }
    if (c === '/' && d === '/') {
      const end = text.indexOf('\n', i)
      const stop = end < 0 ? text.length : end
      out += blankOf(text.slice(i, stop))
      i = stop
    } else if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end < 0 ? text.length : end + 2
      out += blankOf(text.slice(i, stop))
      i = stop
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      const content = text.slice(i + 1, j)
      out += c + (keeps(content) ? content : blankOf(content)) + (text[j] === c ? c : '')
      i = text[j] === c ? j + 1 : j
    } else if (c === '`') {
      out += c
      inTemplate = true
      i++
    } else if (c === '{' && depth.length > 0) {
      depth[depth.length - 1]++
      out += c
      i++
    } else if (c === '}' && depth.length > 0) {
      if (depth[depth.length - 1] === 0) {
        depth.pop()
        inTemplate = true
      } else depth[depth.length - 1]--
      out += c
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

const lineOf = (text, index) => {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

const SOURCE_FILE = /\.(?:ts|mts|tsx|mjs|js)$/
const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'tests',
  'test',
  '__tests__',
  '.turbo',
])
const isTestFile = name => /\.spec(?:-d)?\.|\.d\.ts$/.test(name)

/** Source files under `dir`, as absolute paths. Test directories, specs and build output are not source. */
function sourceFiles(root) {
  const dir = resolve(root)
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) out.push(...sourceFiles(join(dir, entry.name)))
    } else if (SOURCE_FILE.test(entry.name) && !isTestFile(entry.name)) {
      out.push(posix(join(dir, entry.name)))
    }
  }
  return out
}

const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Patterns that read trusted name `name` (its `<name>Key` constant, or the exact string). */
function patternsOf(name) {
  const key = `${escapeRe(name)}Key`
  const arg = `(?:\\b${key}\\b|['"]${escapeRe(name)}['"])`
  return {
    key: new RegExp(`\\b${key}\\b`, 'g'),
    alias: new RegExp(`\\b${key}\\s+as\\s+\\w+`, 'g'),
    get: new RegExp(`\\.get\\(\\s*${arg}`, 'g'),
    index: new RegExp(`\\[\\s*${arg}\\s*\\]`, 'g'),
    prop: new RegExp(`\\b(?:ctx|scope|root|context)\\.${escapeRe(name)}\\b`, 'g'),
    sanctioned: new RegExp(`readTrusted\\(\\s*${arg}\\s*\\)\\s*$`),
  }
}

const matches = (re, text) => [...text.matchAll(re)].map(m => m.index)

/**
 * Entry object module rule: the only way to read a trusted name is `env.readTrusted(name)`, and the
 * `get` that follows it. Any other `get`, index, `ctx.name` or aliased import is a root read.
 */
function entryReads(code, name) {
  const p = patternsOf(name)
  const found = []
  for (const index of matches(p.get, code))
    if (!p.sanctioned.test(code.slice(0, index))) found.push({ index, how: 'get' })
  for (const index of matches(p.index, code)) found.push({ index, how: 'index' })
  for (const index of matches(p.prop, code)) found.push({ index, how: 'property' })
  for (const index of matches(p.alias, code)) found.push({ index, how: 'aliased-import' })
  return found
}

/** Row source rule: every mention of the name counts, because a row that cannot see it must not name it. */
function rowMentions(code, name) {
  const p = patternsOf(name)
  const found = new Map()
  for (const re of [p.key, p.get, p.index, p.prop, p.alias]) {
    for (const index of matches(re, code)) {
      const line = lineOf(code, index)
      if (!found.has(line)) found.set(line, { index, how: 'mention' })
    }
  }
  return [...found.values()]
}

/** Replace `import ... from '...'` statements by blanks, so the imported name is not a mention. */
const withoutImports = code =>
  code.replace(/\bimport\s+(?:type\s+)?[^;'"`]*?from\s*(['"])[^'"\n]*\1/g, m =>
    m.replace(/[^\n]/g, ' '),
  )

const rowIdsIn = (code, rowIds) => {
  if (!/\bdefineRow\(/.test(code)) return []
  return [...code.matchAll(/\brow:\s*'([a-z0-9][a-z0-9-]*)'/g)]
    .map(m => m[1])
    .filter(id => rowIds.includes(id))
}

/** Which rows a file under `src/rows` belongs to: the rows it declares, else the rows of its importers, else of its directory. */
function rowOwners(files, rowsRoot) {
  const byPath = new Map(files.map(f => [f.path, f]))
  const resolveImport = (from, spec) => {
    const base = posix(resolve(dirname(from), spec))
    for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')])
      if (byPath.has(candidate)) return candidate
    return null
  }
  const importers = new Map(files.map(f => [f.path, new Set()]))
  for (const f of files) {
    for (const m of f.imports) {
      const target = resolveImport(f.path, m)
      if (target !== null && target !== f.path) importers.get(target).add(f.path)
    }
  }
  const owners = new Map()
  for (const f of files) {
    if (f.declared.length > 0) {
      owners.set(f.path, new Set(f.declared))
      continue
    }
    const seen = new Set([f.path])
    const rows = new Set()
    const queue = [...importers.get(f.path)]
    while (queue.length > 0) {
      const next = queue.pop()
      if (seen.has(next)) continue
      seen.add(next)
      const importer = byPath.get(next)
      if (importer.declared.length > 0) for (const id of importer.declared) rows.add(id)
      else queue.push(...importers.get(next))
    }
    for (
      let dir = dirname(f.path);
      rows.size === 0 && dir.length > rowsRoot.length;
      dir = dirname(dir)
    )
      for (const mate of files)
        if (dirname(mate.path) === dir) for (const id of mate.declared) rows.add(id)
    owners.set(f.path, rows)
  }
  return owners
}

/**
 * E1. `trusted` is the table of the assembly page (`[{ row, names }]`), `pending` the names the table
 * should list but does not yet. Returns findings; `pending` findings never fail the check.
 */
export function scanTrustedReads({ srcRoot, repoRoot, trusted, rowIds, pending }) {
  const visible = new Map((trusted ?? []).map(e => [e.row, new Set(e.names)]))
  const tableNames = new Set((trusted ?? []).flatMap(e => e.names))
  const pendingNames = pending.filter(name => !tableNames.has(name))
  const names = [...tableNames, ...pendingNames]
  const isPending = name => pendingNames.includes(name)
  const keep = new Set([...names, ...rowIds])
  const findings = []
  const rel = path => posix(relative(repoRoot, path))
  const add = (code, name, path, line, detail, rows) =>
    findings.push({
      code,
      name,
      file: rel(path),
      line,
      detail,
      rows,
      pending: isPending(name),
    })

  for (const path of sourceFiles(join(srcRoot, 'entry'))) {
    const code = mask(readFileSync(path, 'utf8'), keep)
    for (const name of names)
      for (const { index, how } of entryReads(code, name))
        add('root-read', name, path, lineOf(code, index), how, [])
  }

  const rowsRoot = posix(resolve(srcRoot, 'rows'))
  const files = sourceFiles(join(srcRoot, 'rows')).map(path => {
    const text = readFileSync(path, 'utf8')
    const code = mask(text, keep)
    const imports = [...mask(text, true).matchAll(/\bfrom\s*['"](\.[^'"\n]*)['"]/g)].map(m => m[1])
    return { path, code, imports, declared: rowIdsIn(code, rowIds) }
  })
  const owners = rowOwners(files, rowsRoot)
  for (const file of files) {
    const rows = [...owners.get(file.path)].sort()
    const code = withoutImports(file.code)
    for (const name of names) {
      if (rows.some(row => visible.get(row)?.has(name))) continue
      for (const { index } of rowMentions(code, name))
        add('row-not-visible', name, file.path, lineOf(code, index), 'mention', rows)
    }
  }
  return findings
}

/** E2. Issuer call sites outside the allow-list (repository-relative paths) and its definition owners. */
export function scanIssuerCalls({ repoRoot, roots, callSites, definitionOwners }) {
  const allowed = new Set([...callSites, ...definitionOwners])
  const findings = []
  for (const root of roots) {
    for (const path of sourceFiles(join(repoRoot, root))) {
      const file = posix(relative(repoRoot, path))
      if (allowed.has(file)) continue
      const code = mask(readFileSync(path, 'utf8'))
      for (const m of code.matchAll(/\bissue(ActingForTenant|System)\s*\(/g))
        findings.push({
          code: 'issuer-call-site',
          name: `issue${m[1]}`,
          file,
          line: lineOf(code, m.index),
          detail: 'call',
          rows: [],
          pending: false,
        })
    }
  }
  return findings
}

/** `<file>:<line>` ordering so output is stable. */
export const byLocation = (a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1)

export function describeFinding(f) {
  const rows = f.rows.length > 0 ? ` rows=${f.rows.join(',')}` : ''
  const where = `${f.file}:${f.line}`
  if (f.code === 'root-read')
    return `${f.code} ${f.name} ${where} (${f.detail}): an entry object reads a trusted name only through env.readTrusted`
  if (f.code === 'row-not-visible')
    return `${f.code} ${f.name} ${where}${f.rows.length > 0 ? rows : ' rows=(none)'}: no row of this file lists the name as visible`
  return `${f.code} ${f.name} ${where}: not an allowed issuer call site`
}

export function readTrustConfig(path) {
  const config = JSON.parse(readFileSync(path, 'utf8'))
  for (const key of ['pending', 'issuerCallSites', 'issuerDefinition', 'issuerScanRoots']) {
    if (!Array.isArray(config[key]) || config[key].some(v => typeof v !== 'string'))
      throw new Error(`trust config ${path}: "${key}" must be an array of strings`)
  }
  return config
}
