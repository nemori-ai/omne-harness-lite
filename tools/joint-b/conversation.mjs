// 联调 B 的 S2 补齐与 S3 脚本。
// 判据来源：`slices.md` 的 S2-1～S2-3（单轮真实回复）与 S3（同一会话多轮），以及波 2 边界页第五节。
//
// 用法：
//   node tools/joint-b/conversation.mjs [--model-source real|replay] [--evidence <目录>] [--keep]
//
// `--model-source` 只在发行树上模型侧全是真件时才用：真实模型调用或获准回放要有授权，
// 不给这个参数就不发会触到真实模型的消息，相关步骤记等件。它只标注证据，不改变脚本行为。
//
// 判定三种：通过、失败、等件。观察不到的一律等件，不假通过。
// 退出码：全部通过 0；有失败 1；只剩等件 3。
//
// 不改实现，不构造替身：只经构建产物起真进程，读它们的行为与只读打开的 SQLite 域文件。
import {
  REPLY_TIMEOUT_MS,
  blockAll,
  blockedCount,
  entryText,
  evidenceDirFor,
  failureCount,
  holdTestSlot,
  inputMessageCount,
  isReplyEntry,
  isUserEntry,
  logEntries,
  missingBuild,
  modelCalls,
  modelParts,
  newScratch,
  openSession,
  parseArgs,
  readHistory,
  recorder,
  relevantDoubles,
  report,
  sendInput,
  startTree,
  succeeded,
  waitFor,
} from './support.mjs'

holdTestSlot(import.meta.url)

const args = parseArgs(process.argv.slice(2))
const ROUND_TEXTS = ['joint-b round one', 'joint-b round two', 'joint-b round three']
const MODEL_SIDE = /^(agent-|model-|session-ad|session-provider|session-handoff|request-context|runtime-context)/

const BUILD_AWAIT =
  '两个应用成员的构建产物：pnpm --filter @omne-harness/harness-server... run build' +
  ' 与 pnpm --filter @omne-harness/cli... run build'
const REAL_ROWS_AWAIT =
  '波 2 的 L-RUN 与 L-MODEL 把 session-ad*、agent-*、model-records、model-host 等行换进真件，' +
  '联调 A 装配后遗留的等件（session-ad10、session-ad12、AD-02、model-host）先闭合'
const MODEL_SOURCE_AWAIT =
  '真实模型或获准回放的授权：以 --model-source real|replay 重跑，并在运维层给出模型凭据或回放记录'
const COUNT_EVENT_AWAIT =
  'L-RUN 在会话历史页读取处发出的计数事件（本脚本看不到进程内的读取次数；' +
  '读取次数由 L-RUN 给出可读的观察来源后再接进来）'

const STEPS = [
  ['S2', 'S2-1 发一条消息并等到回复'],
  ['S2', 'S2-2 读历史看到用户输入与模型回复两条'],
  ['S2', 'S2-3 Model 账目有一次请求'],
  ['S2', 'S2-3 Journal 有对应条目'],
  ['S2', 'S2-3 会话日志修订号连续'],
  ['S3', 'S3-1 同一会话连发三条消息，三轮都得到回复'],
  ['S3', 'S3-2 三次请求的输入消息数递增'],
  ['S3', 'S3-2 第 2、3 轮的历史页读取次数只与新增消息有关'],
  ['S3', 'S3-3 供应商请求里有回放块'],
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
  const scratch = newScratch('joint-b-conv-')
  try {
    await run(scratch)
  } catch (error) {
    rec.fail('flow', '脚本跑到最后', String(error?.stack ?? error))
  } finally {
    if (args.keep) process.stdout.write(`保留临时目录：${scratch.base}\n`)
    else scratch.remove()
  }
}

async function run(scratch) {
  const tree = await startTree(scratch)
  try {
    const doubles = relevantDoubles(tree.records, MODEL_SIDE)
    evidence = { modelSource: args.modelSource ?? null, doubleRows: doubles }
    if (doubles.length === 0 && args.modelSource === undefined) {
      blockAll(rec, STEPS, '树上模型侧已是真件，发消息会触到真实模型，但没有给模型来源', MODEL_SOURCE_AWAIT)
      return
    }
    const opened = openSession(tree)
    if (opened.session === '') {
      blockAll(rec, STEPS, `建会话没有成功（${opened.detail}），后面的判据走不到`, REAL_ROWS_AWAIT)
      return
    }
    // 树上还有替身时没有真实回复，等得短些；真实模型按上限等。
    const waitMs = doubles.length > 0 ? 3000 : REPLY_TIMEOUT_MS
    const rounds = []
    for (const [index, text] of ROUND_TEXTS.entries()) {
      const sent = sendInput(tree, opened.session, text)
      const replied = succeeded(sent)
        ? await waitFor(async () => {
            const history = await readHistory(tree, opened.session)
            const replies = history.entries.filter(entry => isReplyEntry(entry, ROUND_TEXTS))
            return replies.length > index ? history : undefined
          }, waitMs)
        : undefined
      rounds.push({ text, sent: succeeded(sent), history: replied })
      if (index === 0) round1(tree, scratch, opened.session, rounds[0], doubles)
      if (replied === undefined) break
    }
    rounds23(scratch, rounds, doubles)
  } finally {
    await tree.handle.kill()
  }
}

/** S2：第一轮之后立即观察，账目与日志此时只应有这一轮。 */
function round1(tree, scratch, session, round, doubles) {
  const awaiting = doubles.length > 0 ? REAL_ROWS_AWAIT : 'E1 的真件环节'
  const none = '第一轮没有得到回复'
  if (!round.sent || round.history === undefined) {
    const sentNote = round.sent ? '' : '（send-input 没有成功）'
    for (const [, name] of STEPS.filter(([step]) => step === 'S2'))
      rec.settle('S2', name, doubles.length > 0 ? undefined : false, none + sentNote, awaiting)
    return
  }
  rec.settle('S2', STEPS[0][1], true, '发出输入并在上限内读到回复条目', awaiting, doubles)
  const entries = round.history.entries
  const users = entries.filter(entry => isUserEntry(entry, ROUND_TEXTS[0]))
  const replies = entries.filter(entry => isReplyEntry(entry, ROUND_TEXTS))
  rec.settle(
    'S2',
    STEPS[1][1],
    users.length === 1 && replies.length === 1 && entries.length === 2,
    `历史 ${String(entries.length)} 条（用户 ${String(users.length)}、回复 ${String(replies.length)}）：` +
      entries.map(entry => String(entry.kind)).join(','),
    awaiting,
    doubles,
  )

  const calls = modelCalls(scratch.storageRoot)
  rec.settle(
    'S2',
    STEPS[2][1],
    calls === undefined ? undefined : calls.length === 1,
    calls === undefined
      ? '存储里没有 md_call 表：Model 账目不在这棵树的存储里'
      : `md_call ${String(calls.length)} 行`,
    'model-records 行换成真件，Model 账目写进耐久存储（L-MODEL，S2-3 等 model-host 真件）',
    doubles,
  )

  const log = logEntries(scratch.storageRoot, session)
  const callIds = (calls ?? []).map(call => String(call.call))
  const linked =
    log === undefined || calls === undefined
      ? undefined
      : log.some(entry => callIds.some(id => entryText(entry).includes(id)))
  rec.settle(
    'S2',
    STEPS[3][1],
    linked,
    log === undefined
      ? '存储里没有 sl_entry 表：会话日志不在这棵树的存储里'
      : calls === undefined
        ? '看不到 Model 账目，无从对应'
        : `会话日志 ${String(log.length)} 条，${linked ? '有' : '没有'}条目引用这次请求的 call`,
    'Agent 的 Journal 经 session-ad01 兑现并写入会话日志，带 Model 调用标识（L-RUN，AD-02）',
    doubles,
  )

  const revisions = log === undefined ? undefined : [...new Set(log.map(entry => Number(entry.revision)))].sort((a, b) => a - b)
  const contiguous =
    revisions === undefined
      ? undefined
      : revisions.length > 1 && revisions.every((value, i) => i === 0 || value === revisions[i - 1] + 1)
  rec.settle(
    'S2',
    STEPS[4][1],
    contiguous,
    revisions === undefined ? '读不到会话日志' : `修订号 ${revisions.join(',') || '（无）'}`,
    'AD-02 提交解释与同根索引（L-RUN）',
    doubles,
  )
  evidence.round1 = {
    history: entries,
    modelCalls: calls?.map(call => ({ call: call.call, state: call.state })),
    logRevisions: revisions,
  }
}

/** S3：三轮之后观察账目里三次请求的输入消息数与回放块。 */
function rounds23(scratch, rounds, doubles) {
  const awaiting = doubles.length > 0 ? REAL_ROWS_AWAIT : 'E1 多轮的真件环节'
  const done = rounds.filter(round => round.history !== undefined).length
  rec.settle(
    'S3',
    STEPS[5][1],
    doubles.length > 0 && done === 0 ? undefined : done === ROUND_TEXTS.length,
    `${String(done)}/${String(ROUND_TEXTS.length)} 轮得到回复`,
    awaiting,
    doubles,
  )

  const calls = modelCalls(scratch.storageRoot)
  const counts = calls?.map(call => inputMessageCount(call.request))
  const observed = counts !== undefined && counts.length === ROUND_TEXTS.length && counts.every(n => n !== undefined)
  rec.settle(
    'S3',
    STEPS[6][1],
    observed ? counts.every((n, i) => i === 0 || n > counts[i - 1]) : undefined,
    calls === undefined
      ? '没有 md_call 表'
      : `账目 ${String(calls.length)} 次请求，输入消息数 ${counts.map(n => String(n ?? '读不出')).join(',')}` +
          (observed ? '' : '；请求原文没有保留或读不出消息数组'),
    'Model 账目保留请求原文，或 L-MODEL 的观察服务（D-MODEL）给出每次请求的输入消息数',
    doubles,
  )

  rec.blocked(
    'S3',
    STEPS[7][1],
    '历史页读取次数是 Session 进程内的计数，磁盘上没有；本脚本只看域文件，看不到',
    COUNT_EVENT_AWAIT,
  )

  const parts = modelParts(scratch.storageRoot)
  const reasoned = parts?.some(part => /reasoning|thinking|encrypted/i.test(String(part.payload)))
  const laterRequests = (calls ?? []).slice(1).map(call => call.request)
  const replayed =
    parts === undefined || laterRequests.length === 0 || laterRequests.some(r => r == null)
      ? undefined
      : reasoned
        ? laterRequests.every(request => /reasoning|encrypted/i.test(String(request)))
        : undefined
  rec.settle(
    'S3',
    STEPS[8][1],
    replayed,
    parts === undefined
      ? '没有 md_part 表，看不到模型返回了什么'
      : !reasoned
        ? '模型没有返回加密推理块，无从核对回放（#605，范围按 D-09）'
        : laterRequests.some(r => r == null)
          ? '请求原文没有保留'
          : '第一轮返回过推理块，核对后面各轮请求',
    '模型返回加密推理块并保留请求原文（真实模型或带推理块的获准回放，D-09 的范围）',
    doubles,
  )
  evidence.rounds = rounds.map(round => ({ text: round.text, replied: round.history !== undefined }))
  evidence.inputCounts = counts
}

await main()
process.exitCode = report('conversation', checks, evidenceDirFor('conversation', args.evidence), {
  failures: failureCount(checks),
  blocked: blockedCount(checks),
  ...evidence,
})
