import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  BLOCKED,
  FAIL,
  PASS,
  SESSION_PATH,
  doubleRows,
  freePort,
  post,
  readHistoryRequest,
  repoRoot,
  runOmne,
  savedLoginProof,
  savedTenant,
  startServer,
  verdict,
  writeJson,
} from '../joint-a/support.mjs'
import { operatorLayerB } from './operator.mjs'

export * from '../joint-a/support.mjs'

export function evidenceDirFor(name, override) {
  return override ?? join(repoRoot, 'tmp', 'm2-joint-b', name)
}

export function parseArgs(argv) {
  const value = flag => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  return {
    keep: argv.includes('--keep'),
    evidence: value('--evidence'),
    platform: value('--platform'),
    modelSource: value('--model-source'),
    definition: value('--definition') ?? DEFAULT_DEFINITION,
  }
}

export const DEFAULT_DEFINITION = 'coding'

export const MODEL_SIDE =
  /^(agent-|model-|session-ad|session-provider|session-handoff|session-conditions|request-context|runtime-context)/

export const TOOL_SIDE =
  /^(agent-|model-|session-ad|session-provider|session-handoff|session-conditions|request-context|runtime-context|tool-|execution|command|terminal|app-access|access-)/

export const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

export async function waitFor(probe, timeoutMs, stepMs = 500) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const got = await probe()
    if (got) return got
    if (Date.now() >= deadline) return undefined
    await sleep(stepMs)
  }
}

export const REPLY_TIMEOUT_MS = Number(process.env['OMNE_JOINT_B_REPLY_MS'] ?? 90_000)

export function recorder(checks) {
  const add = (step, name, state, detail, awaiting) =>
    checks.push(verdict(step, name, state, detail, awaiting))
  return {
    add,
    pass: (step, name, detail) => add(step, name, PASS, detail),
    fail: (step, name, detail) => add(step, name, FAIL, detail),
    blocked: (step, name, detail, awaiting) => add(step, name, BLOCKED, detail, awaiting),
    settle: (step, name, ok, detail, awaiting, doubles = []) => {
      if (ok === undefined) add(step, name, BLOCKED, detail, awaiting)
      else if (doubles.length > 0)
        add(
          step,
          name,
          BLOCKED,
          `替身上的观察（${ok ? '成立' : '不成立'}）：${detail}。树上仍有替身行：${doubles.join(', ')}`,
          awaiting,
        )
      else add(step, name, ok ? PASS : FAIL, detail)
    },
  }
}

export function blockAll(rec, steps, detail, awaiting) {
  for (const [step, name] of steps) rec.blocked(step, name, detail, awaiting)
}

export function relevantDoubles(records, pattern) {
  return doubleRows(records).filter(entry => pattern.test(entry))
}

export const CREDENTIAL = 'joint-b-pw-alice-5e3a'

export async function startTree(scratch, options = {}) {
  const port = await freePort()
  const operatorPath = join(scratch.base, 'operator.json')
  writeJson(
    operatorPath,
    operatorLayerB({ storageRoot: scratch.storageRoot, port, historyKinds: options.historyKinds }),
  )
  const handle = await startServer({ stateRoot: scratch.stateRoot, operatorPath, port })
  const home = join(scratch.base, 'home-alice')
  const server = `http://127.0.0.1:${String(port)}`
  const cli = (args, credential) => runOmne({ args, home, server, cwd: scratch.base, credential })
  return { port, handle, home, cli, records: handle.records() }
}

const succeeded = run => run.status === 0 && run.result?.outcome === 'succeeded'
export { succeeded }

export function openSession(tree, definition = DEFAULT_DEFINITION) {
  const register = tree.cli(['register', '--login-identifier', 'alice'], CREDENTIAL)
  const login = tree.cli(['login', '--login-identifier', 'alice'], CREDENTIAL)
  const created = tree.cli(['create-session', '--definition', definition])
  const all = [register, login, created]
  return {
    session: all.every(succeeded) ? String(created.result?.body?.session ?? '') : '',
    detail:
      `注册 ${String(register.status)}，登录 ${String(login.status)}，` +
      `建会话（定义 ${definition}）${String(created.status)}`,
  }
}

export const sendInput = (tree, session, text) =>
  tree.cli(['send-input', '--session', session, '--text', text])

export async function readHistory(tree, session) {
  const tenant = savedTenant(tree.home)
  const proof = savedLoginProof(tree.home)
  const entries = []
  let cursor = null
  for (let page = 0; page < 200; page++) {
    const reply = await post(
      tree.port,
      SESSION_PATH,
      readHistoryRequest(tenant, session, proof, {
        cursor,
        messageId: `joint-b-history-${String(page)}`,
      }),
    )
    let body
    try {
      body = JSON.parse(reply.body)
    } catch {
      return { entries, status: reply.status, complete: false, raw: reply.body }
    }
    if (body?.outcome !== 'succeeded')
      return { entries, status: reply.status, complete: false, raw: reply.body }
    entries.push(...(body.body?.entries ?? []))
    cursor = body.body?.next ?? null
    if (cursor === null) return { entries, status: reply.status, complete: true }
  }
  return { entries, status: undefined, complete: false, raw: '翻页超过 200 页' }
}

export const entryText = entry =>
  JSON.stringify(entry, (_key, value) =>
    value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : value,
  )

export const isUserEntry = (entry, text) => entryText(entry).includes(text)

export function isReplyEntry(entry, inputTexts) {
  const text = entryText(entry)
  if (inputTexts.some(input => text.includes(input))) return false
  return (
    /assistant|model|reply|response/i.test(String(entry.kind)) || /"role":"assistant"/.test(text)
  )
}

export function runIdOf(entries) {
  for (const entry of entries) {
    if (entry.kind !== 'run.started') continue
    const run = entry.payload?.run
    if (typeof run === 'string' && run !== '') return run
  }
  return undefined
}

export function rowsOf(storageRoot, table, sql) {
  const dir = join(storageRoot, 'domains')
  let files
  try {
    files = readdirSync(dir).filter(name => name.endsWith('.sqlite'))
  } catch {
    return undefined
  }
  let found
  for (const file of files) {
    const db = new DatabaseSync(join(dir, file), { readOnly: true })
    try {
      const hasTable = db
        .prepare("select name from sqlite_master where type = 'table' and name = ?")
        .all(table)
      if (hasTable.length === 0) continue
      found = [...(found ?? []), ...db.prepare(sql ?? `select * from ${table}`).all()]
    } finally {
      db.close()
    }
  }
  return found
}

export const modelCalls = storageRoot =>
  rowsOf(storageRoot, 'md_call', 'select * from md_call order by rowid')

export const modelParts = storageRoot =>
  rowsOf(storageRoot, 'md_part', 'select * from md_part order by rowid')

export const logEntries = (storageRoot, session) =>
  rowsOf(
    storageRoot,
    'sl_entry',
    `select position, revision, kind, entry from sl_entry where session = '${session.replaceAll("'", "''")}' order by position`,
  )

export function inputMessageCount(request) {
  let parsed
  try {
    parsed = typeof request === 'string' ? JSON.parse(request) : request
  } catch {
    return undefined
  }
  const seen = new Set()
  const walk = node => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return undefined
    seen.add(node)
    for (const key of ['messages', 'input', 'inputs'])
      if (Array.isArray(node[key])) return node[key].length
    for (const child of Object.values(node)) {
      const got = walk(child)
      if (got !== undefined) return got
    }
    return undefined
  }
  return walk(parsed)
}
