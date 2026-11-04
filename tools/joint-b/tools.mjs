// 联调 B 的 S4 脚本：模型经 `Shell()` 与 `Files()` 在宿主上做事。
// 判据来源：`slices.md` 的 S4 与波 2 边界页第五节「S4-1～S4-5、S4-7、S4-9」。
//
// 用法：
//   node tools/joint-b/tools.mjs [--platform windows|linux] [--model-source real|replay]
//                                [--evidence <目录>] [--keep]
//
// `--platform` 只标注证据，并核对与本机一致；跨平台由调用方分别在 Windows 宿主与 WSL 独立检出上各跑一遍，
// 结果分别报告。没跑的一侧不算通过。
// `--model-source` 与 `conversation.mjs` 相同：真实模型或获准回放要有授权。
//
// 判定三种：通过、失败、等件。观察不到的一律等件，不假通过。
// 退出码：全部通过 0；有失败 1；只剩等件 3。
//
// 不改实现，不构造替身：只经构建产物起真进程，读宿主文件系统与只读打开的 SQLite 域文件。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  blockAll,
  blockedCount,
  entryText,
  evidenceDirFor,
  failureCount,
  holdTestSlot,
  missingBuild,
  modelCalls,
  newScratch,
  openSession,
  parseArgs,
  readHistory,
  runIdOf,
  recorder,
  relevantDoubles,
  report,
  rowsOf,
  sendInput,
  sleep,
  startTree,
  TOOL_SIDE,
  succeeded,
  waitFor,
  REPLY_TIMEOUT_MS,
} from './support.mjs'

holdTestSlot(import.meta.url)

const args = parseArgs(process.argv.slice(2))
const HOST_PLATFORM = process.platform === 'win32' ? 'windows' : process.platform
const PLATFORM = args.platform ?? HOST_PLATFORM

/** 默认两类之外加 `run.started`：S4-7 靠它读 Run 标识。 */
const HISTORY_KINDS = ['message.user', 'message.assistant', 'run.started']

const READ_TOKEN = 'joint-b-read-token-7f3c9'
const SECOND_FILE = 'second.txt'
const WRITTEN_TEXT = 'joint-b written by Files write'
const EDIT_BEFORE = 'alpha line\nkeep line\n'
const EDIT_AFTER = 'beta line\nkeep line\n'
const LONG_SECONDS = 120

const BUILD_AWAIT =
  '两个应用成员的构建产物：pnpm --filter @omne-harness/harness-server... run build' +
  ' 与 pnpm --filter @omne-harness/cli... run build'
const REAL_ROWS_AWAIT =
  '树上替身行换进真件：模型侧同 conversation.mjs，加 tool-records、tool-runtime、tool-executor、' +
  'tool-instances、tool-environments 与 execution-environment、execution-files、execution-command、' +
  'execution-host（见 README「S2～S4 依赖哪些行是真件」）；替身清单见证据文件的 doubleRows'
const MODEL_SOURCE_AWAIT =
  '真实模型或获准回放的授权：以 --model-source real|replay 重跑，并在运维层给出模型凭据或回放记录'
const RECORD_AWAIT =
  '执行环境的命令记录落进耐久存储（L-TOOL 的 tool-records 行，tl_record）；本脚本只读域文件'
const REQUEST_AWAIT =
  'Model 账目保留请求原文，或 L-MODEL 的观察服务（D-MODEL）给出每次请求的输入；本脚本读 md_call.request'

const STEPS = [
  ['S4-1', 'S4-1 Shell：create_session 后同一会话 execute 两次，宿主上有第二条命令的产物'],
  ['S4-2', 'S4-2 第二次 execute 继承第一次留下的工作目录'],
  ['S4-3', 'S4-3 执行环境有这两条命令的记录'],
  ['S4-3', 'S4-3 下一次请求里有 Shell 的结果块'],
  ['S4-4', 'S4-4 Files read：读出宿主文件，内容进入结果'],
  ['S4-4', 'S4-4 Files write：宿主文件真的写出'],
  ['S4-4', 'S4-4 Files edit：精确编辑，其余内容不变'],
  ['S4-5', 'S4-5 下一次请求里有 Files 的结果块'],
  ['S4-7', 'S4-7 长命令执行中取消 Run：Run 以取消终态结束'],
  ['S4-7', 'S4-7 取消之后没有新的模型请求与工具动作，已有结果可查'],
  ['S4-9', `S4-9 平台：本次在 ${PLATFORM} 上跑，S4-1～S4-7 全部通过`],
]

const checks = []
const rec = recorder(checks)
let evidence = {}

async function main() {
  const missing = missingBuild()
  if (missing.length > 0) {
    process.stdout.write(`缺构建产物：${missing.join(', ')}\n`)
    blockAll(rec, STEPS, '构建产物不在，无法起进程', BUILD_AWAIT)
    return
  }
  const scratch = newScratch('joint-b-tools-')
  try {
    await run(scratch)
  } catch (error) {
    rec.fail('flow', '脚本跑到最后', String(error?.stack ?? error))
  } finally {
    if (args.keep) process.stdout.write(`保留临时目录：${scratch.base}\n`)
    else scratch.remove()
  }
}

/** 一轮：发消息，等历史条目增长并稳定。返回这一轮之后的历史，没等到为 undefined。 */
async function driveRound(tree, session, text, waitMs) {
  const before = (await readHistory(tree, session)).entries.length
  const sent = sendInput(tree, session, text)
  if (!succeeded(sent)) return undefined
  let last = -1
  let stableSince = 0
  return waitFor(async () => {
    const history = await readHistory(tree, session)
    const size = history.entries.length
    if (size <= before) return undefined
    if (size !== last) {
      last = size
      stableSince = Date.now()
      return undefined
    }
    return Date.now() - stableSince >= 2000 ? history : undefined
  }, waitMs)
}

const requestsOf = storageRoot => (modelCalls(storageRoot) ?? []).map(call => call.request)
const TOOL_RESULT = /tool[_-]?result|function_call_output|toolResult/i

/** 在目录下递归找文件名。 */
function findFile(root, name) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(path, name)
      if (found !== undefined) return found
    } else if (entry.name === name) return path
  }
  return undefined
}

async function run(scratch) {
  const tree = await startTree(scratch, { historyKinds: HISTORY_KINDS })
  try {
    const doubles = relevantDoubles(tree.records, TOOL_SIDE)
    evidence = {
      definition: args.definition,
      platform: PLATFORM,
      hostPlatform: HOST_PLATFORM,
      modelSource: args.modelSource ?? null,
      doubleRows: doubles,
    }
    if (doubles.length === 0 && args.modelSource === undefined) {
      blockAll(
        rec,
        STEPS,
        '树上相关行已是真件，发消息会触到真实模型，但没有给模型来源',
        MODEL_SOURCE_AWAIT,
      )
      return
    }
    const opened = openSession(tree, args.definition)
    if (opened.session === '') {
      blockAll(rec, STEPS, `建会话没有成功（${opened.detail}），后面的判据走不到`, REAL_ROWS_AWAIT)
      return
    }
    const waitMs = doubles.length > 0 ? 3000 : REPLY_TIMEOUT_MS * 2
    const workdir = join(scratch.base, 'host-work')
    mkdirSync(workdir)
    writeFileSync(join(workdir, 'read-me.txt'), `${READ_TOKEN}\n`)
    writeFileSync(join(workdir, 'edit-me.txt'), EDIT_BEFORE)
    const awaiting = doubles.length > 0 ? REAL_ROWS_AWAIT : 'S4 的真件环节'
    const settle = (name, ok, detail, wait) =>
      rec.settle(name.slice(0, 4), name, ok, detail, wait ?? awaiting, doubles)

    // ---- Shell
    await driveRound(
      tree,
      opened.session,
      `Use the Shell() tool. First create_session. Then in that same session execute the command ` +
        `cd "${workdir}" and, as a second separate execute, the command: echo from-second > ${SECOND_FILE}`,
      waitMs,
    )
    const second = findFile(scratch.base, SECOND_FILE)
    settle(
      STEPS[0][1],
      second !== undefined,
      second === undefined ? `宿主上找不到 ${SECOND_FILE}` : `产物在 ${second}`,
    )
    settle(
      STEPS[1][1],
      second === undefined ? undefined : existsSync(join(workdir, SECOND_FILE)),
      second === undefined
        ? '第二条命令没有产物，看不出工作目录'
        : `${SECOND_FILE} ${existsSync(join(workdir, SECOND_FILE)) ? '在' : '不在'} ${workdir}`,
    )
    const records = rowsOf(scratch.storageRoot, 'tl_record')
    settle(
      STEPS[2][1],
      records === undefined ? undefined : records.some(row => entryText(row).includes(SECOND_FILE)),
      records === undefined ? '存储里没有 tl_record 表' : `tl_record ${String(records.length)} 行`,
      RECORD_AWAIT,
    )
    const afterShell = requestsOf(scratch.storageRoot)
    const shellSeen =
      afterShell.length === 0 || afterShell.at(-1) == null
        ? undefined
        : afterShell.some(
            r => r != null && String(r).includes(SECOND_FILE) && TOOL_RESULT.test(String(r)),
          )
    settle(
      STEPS[3][1],
      shellSeen,
      afterShell.length === 0
        ? '没有 md_call 行或表'
        : `${String(afterShell.length)} 次请求；认结果块的方式是请求文本里同时有命令文本与 tool result 标记`,
      REQUEST_AWAIT,
    )

    // ---- Files
    await driveRound(
      tree,
      opened.session,
      `Use the Files() tool command read on ${join(workdir, 'read-me.txt')} and tell me the content.`,
      waitMs,
    )
    const readRequests = requestsOf(scratch.storageRoot)
    settle(
      STEPS[4][1],
      readRequests.every(r => r == null)
        ? undefined
        : readRequests.some(r => r != null && String(r).includes(READ_TOKEN)),
      readRequests.length === 0
        ? '没有 md_call 行或表'
        : `读出内容 ${READ_TOKEN} ${readRequests.some(r => r != null && String(r).includes(READ_TOKEN)) ? '出现在' : '没有出现在'}后续请求里`,
      REQUEST_AWAIT,
    )
    await driveRound(
      tree,
      opened.session,
      `Use the Files() tool command write to create ${join(workdir, 'written.txt')} with exactly this content: ${WRITTEN_TEXT}`,
      waitMs,
    )
    const writtenPath = join(workdir, 'written.txt')
    const written = existsSync(writtenPath) ? readFileSync(writtenPath, 'utf8') : undefined
    settle(
      STEPS[5][1],
      written?.trim() === WRITTEN_TEXT,
      written === undefined
        ? '宿主上没有 written.txt'
        : `内容 ${JSON.stringify(written.slice(0, 120))}`,
    )
    await driveRound(
      tree,
      opened.session,
      `Use the Files() tool command edit on ${join(workdir, 'edit-me.txt')} to replace the text "alpha" with "beta" and change nothing else.`,
      waitMs,
    )
    const edited = readFileSync(join(workdir, 'edit-me.txt'), 'utf8').replaceAll('\r\n', '\n')
    settle(STEPS[6][1], edited === EDIT_AFTER, `内容 ${JSON.stringify(edited.slice(0, 120))}`)
    const filesRequests = requestsOf(scratch.storageRoot)
    const filesSeen = filesRequests.every(r => r == null)
      ? undefined
      : filesRequests.some(
          r => r != null && /edit-me\.txt/.test(String(r)) && TOOL_RESULT.test(String(r)),
        )
    settle(
      STEPS[7][1],
      filesSeen,
      filesRequests.length === 0 ? '没有 md_call 行或表' : `${String(filesRequests.length)} 次请求`,
      REQUEST_AWAIT,
    )

    // ---- 取消
    await cancelLongCommand(tree, scratch, opened.session, settle, doubles, waitMs)

    // ---- 平台
    const stepChecks = checks.filter(entry => entry.step !== 'S4-9')
    const mismatch = PLATFORM !== HOST_PLATFORM
    if (mismatch)
      rec.fail(
        'S4-9',
        STEPS[10][1],
        `--platform ${PLATFORM} 与本机 ${HOST_PLATFORM} 不一致，证据会标错平台`,
      )
    else if (stepChecks.every(entry => entry.state === 'pass'))
      rec.pass(
        'S4-9',
        STEPS[10][1],
        `${PLATFORM} 上 S4-1～S4-7 全部通过；另一侧要在独立检出上另跑并分别报告`,
      )
    else
      rec.blocked(
        'S4-9',
        STEPS[10][1],
        `${PLATFORM} 上 S4-1～S4-7 还有 ${String(stepChecks.filter(entry => entry.state !== 'pass').length)} 项没有通过；没通过的平台不算通过`,
        '同上各步骤等的件；Windows 侧另等 T-D Windows 后端，Linux 侧在 WSL 独立检出上跑',
      )
  } finally {
    await tree.handle.kill()
  }
}

/** S4-7：发长命令，找到 Run，取消，核对终态与之后没有新动作。 */
async function cancelLongCommand(tree, scratch, session, settle, doubles, waitMs) {
  const callsBefore = () => (modelCalls(scratch.storageRoot) ?? []).length
  const recordsBefore = () => (rowsOf(scratch.storageRoot, 'tl_record') ?? []).length
  const sent = sendInput(
    tree,
    session,
    `Use the Shell() tool: create_session and execute a command that sleeps for ${String(LONG_SECONDS)} seconds, ` +
      'then wait for it.',
  )
  const started = Date.now()
  const history = succeeded(sent)
    ? await waitFor(
        async () => {
          const read = await readHistory(tree, session)
          return runIdOf(read.entries) === undefined ? undefined : read
        },
        Math.min(waitMs, 30_000),
      )
    : undefined
  const runId = history === undefined ? undefined : runIdOf(history.entries)
  if (runId === undefined) {
    const why =
      '会话历史里没有 run.started 条目，读不到 Run 标识，无从取消。公开读口只有 read-history ' +
      '（CLI 与 SDK 都没有读 Run 的命令），运维层已把 run.started 列进 historyKinds；' +
      '没有该条目说明会话日志还没写出它（会话提供方是替身，或发消息没有触发 Run）'
    for (const name of [STEPS[8][1], STEPS[9][1]])
      rec.blocked(
        'S4-7',
        name,
        why,
        doubles.length > 0
          ? REAL_ROWS_AWAIT
          : 'read-history 在 historyKinds 含 run.started 时读到该条目（Session 契约的 run.started；会话提供方换真件，SS-22）',
      )
    return
  }
  const startedRecords = await waitFor(
    async () => (recordsBefore() > 0 ? recordsBefore() : undefined),
    10_000,
  )
  const cancelled = tree.cli(['cancel-run', '--session', session, '--run', runId])
  const body = cancelled.result?.body
  const ended = body?.kind === 'ended' ? body.terminal?.outcome : undefined
  settle(
    STEPS[8][1],
    succeeded(cancelled)
      ? ended === 'cancelled' || (body?.kind === 'requested' ? undefined : false)
      : false,
    `cancel-run 退出 ${String(cancelled.status)}，outcome ${String(cancelled.result?.outcome)}，body ${JSON.stringify(body ?? null).slice(0, 200)}，` +
      `命令启动到取消 ${String(Date.now() - started)} ms`,
    'cancel-run 返回 ended 的终态，或终态进入会话日志后可读（L-RUN，SS-22、AG-22）',
  )
  const calls = callsBefore()
  const records = recordsBefore()
  await sleep(5000)
  const grown = callsBefore() > calls || recordsBefore() > records
  const kept = (modelCalls(scratch.storageRoot) ?? []).length
  settle(
    STEPS[9][1],
    startedRecords === undefined && records === 0 ? undefined : !grown && kept >= 1,
    `取消后 5 秒：请求 ${String(calls)}→${String(callsBefore())}，工具记录 ${String(records)}→${String(recordsBefore())}，已有请求 ${String(kept)} 条`,
    RECORD_AWAIT,
  )
  evidence.cancel = { runId, outcome: cancelled.result?.outcome, ended: ended ?? null }
}

await main()
process.exitCode = report('tools', checks, evidenceDirFor('tools', args.evidence), {
  failures: failureCount(checks),
  blocked: blockedCount(checks),
  ...evidence,
})
