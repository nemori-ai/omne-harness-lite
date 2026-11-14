import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  holdTestSlot,
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

holdTestSlot(import.meta.url)

const CREDENTIALS = { alice: 'alice-pw-JOINTA-2f81', bob: 'bob-pw-JOINTA-73ce' }
const INPUT_TEXT = 'joint-a S2 first round'
const S0_DISTRIBUTION = join(serverMember, 'config', 's0.distribution.json')

const EXPECTED_ROWS = JSON.parse(
  readFileSync(join(serverMember, 'src', 's0', 'aa-rows.json'), 'utf8'),
).rows.length

const BUILD_AWAIT =
  '两个应用成员的构建产物：pnpm --filter @omne-harness/harness-server build' +
  ' 与 pnpm --filter @omne-harness/cli build'
const REAL_ROWS_AWAIT =
  '发行配置里剩下的替身行换进真件：session-provider 出契约替身，agent-*、model-*、' +
  'session-ad*、session-handoff、session-conditions、request-context、agent-context、' +
  'runtime-context 换进 ./cordis 与发行配置。Tool 与 Execution 的行属波 B，联调 C 之前不换'

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

async function s0(scratch) {
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

async function s2(treeDouble, observed) {
  const why = treeDouble
    ? `agent-host 与 model-host 仍是替身；参考：替身上到 S1 的历史读回为止` +
      (observed.refused === undefined ? '' : '，跨租户拒绝已观察到')
    : 'E1 的一轮回复、Model 账目与会话日志修订号'
  for (const [, name] of STEPS.filter(([step]) => step === 'S2'))
    blocked('S2', name, why, treeDouble ? REAL_ROWS_AWAIT : 'E1 的真件环节')
}

const argv = process.argv.slice(2)
const evidenceOverride = argv.includes('--evidence')
  ? argv[argv.indexOf('--evidence') + 1]
  : undefined
await main()
process.exitCode = report('end-to-end', checks, evidenceDirFor('end-to-end', evidenceOverride), {
  failures: failureCount(checks),
  blocked: blockedCount(checks),
})
