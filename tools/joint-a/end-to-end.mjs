// 联调 A 的 S0～S2 端到端脚本。
// 判据来源：`slices.md` 的 S0（骨架：插件树装载）、S1（T1–T3 建租户、登录、建会话、发输入）、
// S2（E1 单轮纯消息）。检查步骤的编号与那一页相同。
//
// 用法：
//   node tools/joint-a/end-to-end.mjs [--evidence <目录>] [--keep]
//
// 判定三种：通过、失败、等件。等件不是失败，它写明还差哪一件。
// 退出码：全部通过 0；有失败 1；只剩等件 3。
//
// 不改实现，不构造替身：本脚本只经构建产物 `dist/bin.js` 起真进程，读它们的行为。
// 树上还有替身时，替身树上的观察写进等件的说明里，不记成通过。
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SESSION_PATH,
  blockedCount,
  doubleRows,
  evidenceDirFor,
  failureCount,
  freePort,
  implementations,
  isDenied,
  missingBuild,
  newScratch,
  notActive,
  operatorLayer,
  post,
  readHistoryRequest,
  report,
  runOmne,
  runS0Process,
  savedLoginProof,
  savedTenant,
  serverMember,
  startServer,
  verdict,
  writeJson,
} from './support.mjs'

const CREDENTIALS = { alice: 'alice-pw-JOINTA-2f81', bob: 'bob-pw-JOINTA-73ce' }
const INPUT_TEXT = 'joint-a S2 first round'
const S0_DISTRIBUTION = join(serverMember, 'config', 's0.distribution.json')

/** 组装页的行快照。S0-1 的行数核对以它为据。 */
const EXPECTED_ROWS = JSON.parse(
  readFileSync(join(serverMember, 'src', 's0', 'aa-rows.json'), 'utf8'),
).rows.length

const BUILD_AWAIT =
  '两个应用成员的构建产物：pnpm --filter @omne-harness/harness-server build' +
  ' 与 pnpm --filter @omne-harness/cli build'
const REAL_ROWS_AWAIT =
  'integration/model @ 148412f4a 与 integration/session-run @ 2e635a4df 提升进 mainline，' +
  '之后各线把 session-provider 换出契约替身，并把 agent-*、model-*、session-ad*、' +
  'session-handoff、session-conditions、request-context、agent-context、runtime-context ' +
  '换进 ./cordis 与发行配置'

const checks = []
const record = (step, name, state, detail, awaiting) =>
  checks.push(verdict(step, name, state, detail, awaiting))
const blocked = (step, name, detail, awaiting) => record(step, name, 'blocked', detail, awaiting)

const STEPS = [
  ['S0', 'S0-1 装载并打印插件树（行数与行快照一致）'],
  ['S0', 'S0-1 树里每一行都带替身标记（`s0-double`）'],
  ['S0', 'S0-2 删掉 storage 行后依赖行停在 PENDING，报告写出缺项'],
  ['S0', 'S0-3 `serve` 模式装载发行层，全部启用行 ACTIVE'],
  ['S0', 'S0-4 S0～S2 涉及的行全部换成真件，树里没有替身标记'],
  ['S1', 'S1-1 注册、登录、建会话、发输入各得到公开契约规定的结果'],
  ['S1', 'S1-2 读历史看到这条输入'],
  ['S1', 'S1-3 直接查 SQLite：系统域有账号与登录，租户域有会话日志条目'],
  ['S1', 'S1-4 另一租户的账号读这个会话被拒'],
  ['S2', 'S2-1 发一条消息并等到回复'],
  ['S2', 'S2-2 读历史看到用户输入与模型回复两条'],
  ['S2', 'S2-3 账目有一次请求，Journal 有相应条目，会话日志修订号连续'],
]

async function main() {
  const missing = missingBuild()
  if (missing.length > 0) {
    process.stdout.write(`缺构建产物：${missing.join(', ')}\n`)
    for (const [step, name] of STEPS) blocked(step, name, '构建产物不在，无法起进程', BUILD_AWAIT)
    return
  }
  const scratch = newScratch()
  const argv = process.argv.slice(2)
  const keep = argv.includes('--keep')
  try {
    await s0(scratch)
    await s1AndS2(scratch)
  } catch (error) {
    record('flow', '脚本跑到最后', 'fail', String(error?.stack ?? error))
  } finally {
    if (keep) process.stdout.write(`保留临时目录：${scratch.base}\n`)
    else scratch.remove()
  }
}

// ------------------------------------------------------------------------------ S0

async function s0(scratch) {
  // S0-1：`s0` 模式装发行层。全部行先是标记的替身，读打印出的树核对行数。
  const run = runS0Process()
  const enabled = run.records.filter(entry => entry.kind === 'tree' && entry.disabled !== true)
  const startup = run.records.find(entry => entry.kind === 'startup-result')
  const startupOk =
    run.status === 0 &&
    startup !== undefined &&
    startup.outcome === 'ready' &&
    startup.accepting === false &&
    startup.scope === 'loader-only'
  record(
    'S0',
    'S0-1 装载并打印插件树（行数与行快照一致）',
    startupOk && enabled.length === EXPECTED_ROWS ? 'pass' : 'fail',
    `退出 ${String(run.status)}，启用行 ${String(enabled.length)}，快照 ${String(EXPECTED_ROWS)}，` +
      `startup ${JSON.stringify(startup ?? null)}` +
      (run.stderr === '' ? '' : `，stderr ${run.stderr.slice(0, 300)}`),
  )
  const unmarked = enabled.filter(entry => entry.implementation !== 's0-double')
  record(
    'S0',
    'S0-1 树里每一行都带替身标记（`s0-double`）',
    unmarked.length === 0 ? 'pass' : 'fail',
    unmarked.length === 0
      ? `全部 ${String(enabled.length)} 行带标记`
      : `没有标记的行：${unmarked.map(row => `${String(row.id)}(${String(row.implementation)})`).join(', ')}`,
  )

  // S0-2：删掉 `storage` 行重启。依赖它的行停在 PENDING，退出码 4 表示仍有 PENDING。
  const whole = JSON.parse(readFileSync(S0_DISTRIBUTION, 'utf8'))
  const path = join(scratch.base, 's0-without-storage.json')
  writeJson(path, { rows: whole.rows.filter(row => row.id !== 'storage') })
  const broken = runS0Process({ distribution: path })
  const pending = broken.records
    .filter(entry => entry.kind === 'row-state' && entry.state === 'PENDING')
    .map(entry => String(entry.id))
  const startupBroken = broken.records.find(entry => entry.kind === 'startup-result')
  record(
    'S0',
    'S0-2 删掉 storage 行后依赖行停在 PENDING，报告写出缺项',
    broken.status === 4 && pending.length > 0 ? 'pass' : 'fail',
    `退出 ${String(broken.status)}，PENDING ${pending.length === 0 ? '（无）' : pending.join(', ')}，` +
      `startup ${JSON.stringify(startupBroken ?? null)}` +
      (broken.stderr === '' ? '' : `，stderr ${broken.stderr.slice(0, 300)}`),
  )
}

// ------------------------------------------------------------------------ S1 与 S2

async function s1AndS2(scratch) {
  const port = await freePort()
  const operatorPath = join(scratch.base, 'operator.json')
  writeJson(operatorPath, operatorLayer({ storageRoot: scratch.storageRoot, port }))
  const handle = await startServer({ stateRoot: scratch.stateRoot, operatorPath, port })
  try {
    const records = handle.records()
    const startup = records.find(entry => entry.kind === 'startup-result')
    const pending = notActive(records)
    record(
      'S0',
      'S0-3 `serve` 模式装载发行层，全部启用行 ACTIVE',
      startup?.accepting === true && pending.length === 0 ? 'pass' : 'fail',
      `accepting ${String(startup?.accepting)}，实现计数 ${JSON.stringify(implementations(records))}，` +
        `非 ACTIVE：${pending.length === 0 ? '（无）' : pending.join(', ')}`,
    )

    const doubles = doubleRows(records)
    const treeDouble = doubles.length > 0
    if (treeDouble)
      blocked(
        'S0',
        'S0-4 S0～S2 涉及的行全部换成真件，树里没有替身标记',
        `树里还有 ${String(doubles.length)} 行不是真件：${doubles.join(', ')}`,
        REAL_ROWS_AWAIT,
      )
    else
      record(
        'S0',
        'S0-4 S0～S2 涉及的行全部换成真件，树里没有替身标记',
        'pass',
        '全部启用行是 real',
      )

    // S0-1 后半（AG-16→AG-01）：插件树上有时钟行。`serve` 的入口对象记录写出实现种类。
    const clocks = records.filter(
      entry =>
        entry.kind === 'entry-object' &&
        (entry.name === 'agentClock' || entry.name === 'sessionClock'),
    )
    const realClocks = clocks.filter(entry => entry.implementation === 'real')
    record(
      'S0',
      'S0-1 插件树上有时钟行（AG-16→AG-01 的一半）',
      realClocks.length === clocks.length && clocks.length >= 2 ? 'pass' : 'fail',
      clocks.length === 0
        ? '入口对象记录里没有 agentClock 与 sessionClock'
        : clocks.map(entry => `${String(entry.name)}:${String(entry.implementation)}`).join(' '),
    )

    const observed = await s1(scratch, port, treeDouble)
    await s2(treeDouble, observed)
  } finally {
    await handle.kill()
  }
}

/**
 * S1。树上还有替身时，能跑的前半照跑，观察写进等件的说明；整步仍按等件记。
 * 返回观察，供 S2 的等件说明引用。
 */
async function s1(scratch, port, treeDouble) {
  const homes = { alice: join(scratch.base, 'home-alice'), bob: join(scratch.base, 'home-bob') }
  const url = `http://127.0.0.1:${String(port)}`
  const cli = (who, args, credential) =>
    runOmne({ args, home: homes[who], server: url, cwd: scratch.base, credential })
  const succeeded = run => run.status === 0 && run.result?.outcome === 'succeeded'

  const register = cli('alice', ['register', '--login-identifier', 'alice'], CREDENTIALS.alice)
  const login = cli('alice', ['login', '--login-identifier', 'alice'], CREDENTIALS.alice)
  const created = cli('alice', ['create-session', '--definition', 'assistant'])
  const session = created.status === 0 ? String(created.result?.body?.session ?? '') : ''
  const sent =
    session === ''
      ? undefined
      : cli('alice', ['send-input', '--session', session, '--text', INPUT_TEXT])
  const steps = [register, login, created, sent].filter(run => run !== undefined)
  const detail =
    `注册 ${String(register.status)}，登录 ${String(login.status)}，建会话 ${String(created.status)}，` +
    `发输入 ${sent === undefined ? '（未走）' : String(sent.status)}`

  if (treeDouble) {
    blocked(
      'S1',
      'S1-1 注册、登录、建会话、发输入各得到公开契约规定的结果',
      `${detail}。替身上的观察：${steps.every(succeeded) ? '四步都成功' : '有步骤没有成功'}；` +
        '会话协调者仍是替身，`startRun` 到 Agent 行这一段走不到',
      REAL_ROWS_AWAIT,
    )
  } else
    record(
      'S1',
      'S1-1 注册、登录、建会话、发输入各得到公开契约规定的结果',
      steps.every(succeeded) ? 'pass' : 'fail',
      detail,
    )

  // 接入与持久身份这两段已经是真件（`identity`、`storage`、`server-entry` 行是 real）。
  // 单独报一条，免得等件把已经通的部分盖住。
  record(
    'S1',
    'S1-a 接入层与持久身份两段真件（S1 的一部分，不等于 S1-1）',
    [register, login].every(succeeded) ? 'pass' : 'fail',
    `注册 ${String(register.status)}、登录 ${String(login.status)}，` +
      `outcome ${String(register.result?.outcome)}/${String(login.result?.outcome)}` +
      (register.stderr === '' ? '' : `，stderr ${register.stderr.slice(0, 200)}`),
  )

  const observed = { session, history: undefined, refused: undefined }
  if (session === '') {
    const why = '建会话没有成功，这一段的判据走不到'
    blocked('S1', 'S1-2 读历史看到这条输入', why, REAL_ROWS_AWAIT)
    blocked('S1', 'S1-4 另一租户的账号读这个会话被拒', why, REAL_ROWS_AWAIT)
    blocked('S1', 'S1-3 直接查 SQLite', why, REAL_ROWS_AWAIT)
    return observed
  }

  const ownerTenant = savedTenant(homes.alice)
  const ownerProof = savedLoginProof(homes.alice)
  observed.history = await post(
    port,
    SESSION_PATH,
    readHistoryRequest(ownerTenant, session, ownerProof),
  )
  const historyOk = observed.history.status === 200 && observed.history.body.includes(INPUT_TEXT)
  if (treeDouble)
    blocked(
      'S1',
      'S1-2 读历史看到这条输入',
      `替身上的观察：状态 ${String(observed.history.status)}，` +
        `正文${historyOk ? '含' : '不含'}输入文本；会话历史仍由契约替身保管，不是真实 SQL`,
      REAL_ROWS_AWAIT,
    )
  else
    record(
      'S1',
      'S1-2 读历史看到这条输入',
      historyOk ? 'pass' : 'fail',
      `状态 ${String(observed.history.status)}，正文 ${observed.history.body.slice(0, 240)}`,
    )

  const registerBob = cli('bob', ['register', '--login-identifier', 'bob'], CREDENTIALS.bob)
  const loginBob = cli('bob', ['login', '--login-identifier', 'bob'], CREDENTIALS.bob)
  observed.refused = await post(
    port,
    SESSION_PATH,
    readHistoryRequest(ownerTenant, session, savedLoginProof(homes.bob)),
  )
  const refusedOk = isDenied(observed.refused) && !observed.refused.body.includes(INPUT_TEXT)
  const refusalDetail =
    `bob 注册/登录 ${String(registerBob.status)}/${String(loginBob.status)}，` +
    `读历史状态 ${String(observed.refused.status)}，正文 ${observed.refused.body.slice(0, 200)}`
  if (treeDouble)
    blocked(
      'S1',
      'S1-4 另一租户的账号读这个会话被拒',
      `替身上的观察：${refusedOk ? '被拒' : '没有被拒'}。${refusalDetail}`,
      REAL_ROWS_AWAIT,
    )
  else record('S1', 'S1-4 另一租户的账号读这个会话被拒', refusedOk ? 'pass' : 'fail', refusalDetail)

  await s1_3(scratch, session, treeDouble)
  return observed
}

/**
 * S1-3：直接查 SQLite。系统域有账号与登录记录，租户域有会话日志条目。
 * 域文件由 `storage` 行的真件创建：文件名是域名的十六进制，`system.identity` 是系统域。
 * 租户域的会话日志由真实会话提供者写；它还是替身时，这一半按等件记。
 */
async function s1_3(scratch, session, treeDouble) {
  const dir = join(scratch.storageRoot, 'domains')
  let files = []
  try {
    files = readdirSync(dir).filter(name => name.endsWith('.sqlite'))
  } catch (error) {
    record(
      'S1',
      'S1-3 直接查 SQLite：系统域有账号与登录，租户域有会话日志条目',
      'fail',
      `读不到域文件目录 ${dir}：${String(error)}`,
    )
    return
  }
  let accounts = []
  let logins = 0
  for (const file of files) {
    const db = new DatabaseSync(join(dir, file), { readOnly: true })
    try {
      const tables = db
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map(row => String(row.name))
      if (tables.includes('id_account'))
        accounts = db
          .prepare('select login_identifier as id from id_account order by login_identifier')
          .all()
          .map(row => String(row.id))
      if (tables.includes('id_login'))
        logins = Number(db.prepare('select count(*) as n from id_login').all()[0]?.n ?? 0)
    } finally {
      db.close()
    }
  }
  const systemOk = accounts.includes('alice') && accounts.includes('bob') && logins > 0
  const detail =
    `域文件 ${String(files.length)} 个（${files.join(', ') || '（无）'}），` +
    `账号 ${accounts.join(',') || '（无）'}，登录记录 ${String(logins)} 条，` +
    `会话 ${session.slice(0, 12)}`
  const name = 'S1-3 直接查 SQLite：系统域有账号与登录，租户域有会话日志条目'
  if (treeDouble)
    blocked(
      'S1',
      name,
      `系统域一半：${systemOk ? '账号与登录记录都在' : '缺记录'}；租户域一半走不到，` +
        `会话日志由契约替身保管。${detail}`,
      '真实会话提供者写入租户域的会话日志（integration/session-run）',
    )
  else record('S1', name, systemOk ? 'pass' : 'fail', detail)
}

/** S2：一轮对话得到一次真实模型回复。树上还有替身时按等件记。 */
async function s2(treeDouble, observed) {
  const why = treeDouble
    ? `agent-host 与 model-host 仍是替身；参考：替身上到 S1 的历史读回为止` +
      (observed.refused === undefined ? '' : '，跨租户拒绝已观察到')
    : 'E1 的一轮回复、Model 账目与会话日志修订号'
  for (const [, name] of STEPS.filter(([step]) => step === 'S2'))
    blocked('S2', name, why, treeDouble ? REAL_ROWS_AWAIT : 'E1 的真件环节')
}

// ------------------------------------------------------------------------------ 入口

const argv = process.argv.slice(2)
const evidenceOverride = argv.includes('--evidence')
  ? argv[argv.indexOf('--evidence') + 1]
  : undefined
await main()
process.exitCode = report('end-to-end', checks, evidenceDirFor('end-to-end', evidenceOverride), {
  failures: failureCount(checks),
  blocked: blockedCount(checks),
})
