// Extract the plugin-tree rows (and the optional trusted-subtree table) from the
// application assembly page, then check or write the committed snapshot.
// Plain Node, no dependencies, no build step.
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'docs/architecture/runtime/application-assembly.md'
const ROW_CELL = /^`([a-z0-9][a-z0-9-]*)`$/
const NAME_TOKEN = /`([A-Za-z][A-Za-z0-9]*)`/g

class ParseError extends Error {
  constructor(reason, line) {
    super(`aa-rows: parse ${reason} line ${line}`)
  }
}

const cells = line =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

/** Find the first table in lines[from, to) whose header cells equal `header`. Returns its data rows. */
function findTable(lines, from, to, header) {
  for (let i = from; i < to; i++) {
    if (!lines[i].startsWith('|')) continue
    const head = cells(lines[i])
    if (head.length < header.length || header.some((h, k) => head[k] !== h)) continue
    const rows = []
    for (let j = i + 2; j < to && lines[j].startsWith('|'); j++)
      rows.push({ line: j + 1, cells: cells(lines[j]) })
    return rows
  }
  return null
}

function rowIdOf(row) {
  const match = ROW_CELL.exec(row.cells[0] ?? '')
  if (match === null) throw new ParseError('bad-id-cell', row.line)
  return match[1]
}

export function extract(markdown) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.indexOf('## 插件树')
  if (start < 0) throw new ParseError('missing-section', 0)
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## '))
  if (end < 0) end = lines.length

  const treeRows = findTable(lines, start + 1, end, ['行 id'])
  if (treeRows === null) throw new ParseError('missing-table', start + 1)
  const rows = []
  for (const row of treeRows) {
    const id = rowIdOf(row)
    if (rows.includes(id)) throw new ParseError('duplicate-id', row.line)
    rows.push(id)
  }

  const sub = lines.findIndex((line, i) => i > start && i < end && line === '### 受信子树')
  let trusted = null
  if (sub >= 0) {
    let subEnd = lines.findIndex((line, i) => i > sub && i < end && /^#{2,3} /.test(line))
    if (subEnd < 0) subEnd = end
    const table = findTable(lines, sub + 1, subEnd, ['行 id', '可见的受信名'])
    if (table === null) throw new ParseError('missing-trusted-table', sub + 1)
    trusted = []
    for (const row of table) {
      const id = rowIdOf(row)
      if (!rows.includes(id)) throw new ParseError('trusted-unknown-row', row.line)
      if (trusted.some(entry => entry.row === id))
        throw new ParseError('duplicate-trusted-row', row.line)
      const names = [...(row.cells[1] ?? '').matchAll(NAME_TOKEN)].map(m => m[1])
      if (names.length === 0) throw new ParseError('bad-names-cell', row.line)
      trusted.push({ row: id, names })
    }
  }
  return { source: SOURCE, rows, trusted }
}

const canonical = snapshot =>
  `${JSON.stringify({ source: snapshot.source, rows: snapshot.rows, trusted: snapshot.trusted }, null, 2)}\n`

/** Itemised differences between the AA extraction (aa) and the snapshot (rows). */
export function diff(aa, rows) {
  const out = []
  for (const id of aa.rows) if (!rows.rows.includes(id)) out.push(`+${id}`)
  for (const id of rows.rows) if (!aa.rows.includes(id)) out.push(`-${id}`)
  if (out.length === 0) {
    aa.rows.forEach((id, i) => {
      if (id !== rows.rows[i]) out.push(`order ${i} aa=${id} rows=${rows.rows[i]}`)
    })
  }
  const scopeOf = snapshot => new Map((snapshot.trusted ?? []).map(e => [e.row, e.names.join(',')]))
  const a = scopeOf(aa)
  const r = scopeOf(rows)
  for (const id of new Set([...a.keys(), ...r.keys()])) {
    if (a.get(id) !== r.get(id))
      out.push(`scope ${id} aa=${a.get(id) ?? '-'} rows=${r.get(id) ?? '-'}`)
  }
  if ((aa.trusted === null) !== (rows.trusted === null)) {
    out.push(
      `scope-table aa=${aa.trusted === null ? 'none' : 'present'} rows=${rows.trusted === null ? 'none' : 'present'}`,
    )
  }
  return out
}

function parseArgs(argv) {
  const [command, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) opts[rest[i]] = rest[i + 1]
  if ((command !== 'check' && command !== 'write') || !opts['--aa'] || !opts['--rows']) {
    throw new Error('usage: aa-rows.mjs <check|write> --aa <AA path> --rows <JSON path>')
  }
  return { command, aaPath: opts['--aa'], rowsPath: opts['--rows'] }
}

function main(argv) {
  const { command, aaPath, rowsPath } = parseArgs(argv)
  const aa = extract(readFileSync(aaPath, 'utf8'))
  if (command === 'write') {
    writeFileSync(rowsPath, canonical(aa))
    return 0
  }
  const committed = readFileSync(rowsPath, 'utf8')
  if (committed === canonical(aa)) {
    console.log(
      `aa-rows: ok rows=${aa.rows.length} trusted=${aa.trusted === null ? 'none' : aa.trusted.length}`,
    )
    return 0
  }
  let items
  try {
    items = diff(aa, JSON.parse(committed))
  } catch {
    items = ['bytes snapshot is not valid canonical JSON']
  }
  if (items.length === 0) items = ['bytes snapshot differs only in formatting']
  console.error(['aa-rows: mismatch', ...items].join('\n'))
  return 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof ParseError ? error.message : `aa-rows: ${error.message}`)
  process.exitCode = 2
}
