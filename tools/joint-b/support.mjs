// 联调 B 的公共件。进程、运维者层、判定与记录复用联调 A 的实现（`../joint-a/support.mjs`），
// 这里只加联调 B 自己要的部分：证据目录、参数、起树与会话、历史翻页、域文件只读观察。
//
// 与联调 A 一样，本目录不导入产品包，只经构建产物 `dist/bin.js` 起进程、只读打开 SQLite 文件。
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

/** 证据目录：给了就用给的，否则用 `tmp/m2-joint-b/<脚本名>/`。`tmp/` 不入库。 */
export function evidenceDirFor(name, override) {
  return override ?? join(repoRoot, 'tmp', 'm2-joint-b', name)
}

/** 命令行：`--flag`、`--flag 值`。 */
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

/**
 * 建会话用的定义。`assistant` 没有 `initialModelSelection`，也没有工具引用，拿不到回复、S4 没有工具可调，
 * 所以默认用 `coding`（引用 Files 与 Shell，带模型选择）。可用 `--definition` 改。
 */
export const DEFAULT_DEFINITION = 'coding'

/**
 * 模型一侧会影响 S2～S4 回复与账目的行。树上这些行还是替身时，观察只作参考。
 * 对照 `apps/harness-server/src/s0/stubs.ts` 的行表：Session 侧的 `session-ad*`、`session-provider`、
 * `session-handoff`、`session-conditions`，Agent 侧的 `agent-*`，模型与请求侧的 `model-`、
 * `request-context`、`runtime-context`。
 */
export const MODEL_SIDE =
  /^(agent-|model-|session-ad|session-provider|session-handoff|session-conditions|request-context|runtime-context)/

/** 工具一侧再加：工具行、执行环境与设施行、接入行。 */
export const TOOL_SIDE =
  /^(agent-|model-|session-ad|session-provider|session-handoff|session-conditions|request-context|runtime-context|tool-|execution|command|terminal|app-access|access-)/

export const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

/** 轮询到条件成立或超时。返回最后一次的取值（成立时为真值，超时为 undefined）。 */
export async function waitFor(probe, timeoutMs, stepMs = 500) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const got = await probe()
    if (got) return got
    if (Date.now() >= deadline) return undefined
    await sleep(stepMs)
  }
}

/** 单轮回复的等待上限。真模型慢，可用 `OMNE_JOINT_B_REPLY_MS` 调。 */
export const REPLY_TIMEOUT_MS = Number(process.env['OMNE_JOINT_B_REPLY_MS'] ?? 90_000)

// ------------------------------------------------------------------ 判定记录

/** 记录判定的小工具。`checks` 由调用方持有。 */
export function recorder(checks) {
  const add = (step, name, state, detail, awaiting) =>
    checks.push(verdict(step, name, state, detail, awaiting))
  return {
    add,
    pass: (step, name, detail) => add(step, name, PASS, detail),
    fail: (step, name, detail) => add(step, name, FAIL, detail),
    blocked: (step, name, detail, awaiting) => add(step, name, BLOCKED, detail, awaiting),
    /**
     * 按观察定判定。`ok` 为 true/false 是观察到了；`undefined` 是观察不到，记等件。
     * 树上相关行还有替身时，观察只作参考：写进等件的说明，不记通过也不记失败。
     */
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

/** 一组步骤全部记成等件。 */
export function blockAll(rec, steps, detail, awaiting) {
  for (const [step, name] of steps) rec.blocked(step, name, detail, awaiting)
}

/** 启用的替身行里，`id(implementation)` 符合 `pattern` 的。 */
export function relevantDoubles(records, pattern) {
  return doubleRows(records).filter(entry => pattern.test(entry))
}

// ------------------------------------------------------------------ 起树与会话

export const CREDENTIAL = 'joint-b-pw-alice-5e3a'

/** 起 `serve`。返回句柄与调用 `omne` 的函数。 */
export async function startTree(scratch, options = {}) {
  const port = await freePort()
  const operatorPath = join(scratch.base, 'operator.json')
  // 公开读口 `read-history` 默认只给 message.user 与 message.assistant；S4-7 要从会话日志的
  // `run.started` 条目读 Run 标识，由运维层把这一类也列进 server-entry 的 historyKinds。
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

/** 注册、登录、建会话。有一步不成功时 session 为空串。 */
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

/** 读完整历史：从第一页起沿 `next` 翻页。 */
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

// ------------------------------------------------------------------ 历史条目的分类

/** 条目文本：BLOB 之类按 UTF-8 解码。 */
export const entryText = entry =>
  JSON.stringify(entry, (_key, value) =>
    value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : value,
  )

/** 用户输入条目：载荷含这次发的文本。 */
export const isUserEntry = (entry, text) => entryText(entry).includes(text)

/**
 * 模型回复条目：不含任何一条用户输入，且类别或载荷标明是助手或模型的回复。
 * 历史条目的载荷形状由 Session 契约拥有，这里只做保守的文本判断，认不出就当没有回复。
 */
export function isReplyEntry(entry, inputTexts) {
  const text = entryText(entry)
  if (inputTexts.some(input => text.includes(input))) return false
  return (
    /assistant|model|reply|response/i.test(String(entry.kind)) || /"role":"assistant"/.test(text)
  )
}

/**
 * 从历史条目读 Run 标识：取 kind 为 `run.started` 的条目，读载荷的 `run`。
 * 这是目前唯一的公开读口（CLI 与 SDK 都没有读 Run 的命令），条目由 Session 契约写入
 * （`packages/session/session-contract/src/decide.ts` 的 run.started），要求 `read-history` 列出这一类。
 * 读不到时返回 undefined。
 */
export function runIdOf(entries) {
  for (const entry of entries) {
    if (entry.kind !== 'run.started') continue
    const run = entry.payload?.run
    if (typeof run === 'string' && run !== '') return run
  }
  return undefined
}

// ------------------------------------------------------------------ 域文件只读观察

/** 把存储根下所有域里名为 `table` 的表的行收在一起。表不存在时返回 undefined（不是空数组）。 */
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

/** Model 账目：`md_call` 的行。表不存在时返回 undefined。 */
export const modelCalls = storageRoot =>
  rowsOf(storageRoot, 'md_call', 'select * from md_call order by rowid')

/** Model 回复的内容片段：`md_part` 的行。表不存在时返回 undefined。 */
export const modelParts = storageRoot =>
  rowsOf(storageRoot, 'md_part', 'select * from md_part order by rowid')

/** 会话日志条目：`sl_entry` 的行，按位置。表不存在时返回 undefined。 */
export const logEntries = (storageRoot, session) =>
  rowsOf(
    storageRoot,
    'sl_entry',
    `select position, revision, kind, entry from sl_entry where session = '${session.replaceAll("'", "''")}' order by position`,
  )

/** 请求原文里的输入消息数：取第一个名为 messages、input 或 inputs 的数组的长度。读不出时为 undefined。 */
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
