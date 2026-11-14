import { join } from 'node:path'
import {
  holdTestSlot,
  SESSION_PATH,
  blockedCount,
  doubleRows,
  evidenceDirFor,
  failureCount,
  freePort,
  isDenied,
  isSucceeded,
  missingBuild,
  newScratch,
  operatorLayer,
  post,
  readHistoryRequest,
  replyOf,
  report,
  runOmne,
  savedLoginProof,
  savedTenant,
  startServer,
  verdict,
  writeJson,
} from './support.mjs'

holdTestSlot(import.meta.url)

const CREDENTIALS = { alice: 'alice-pw-REFUSE-4b19', bob: 'bob-pw-REFUSE-8d02' }
const UNKNOWN_SESSION = 'f'.repeat(64)
const SMALL_PAGE = '64'

const checks = []
const record = (step, name, state, detail, awaiting) =>
  checks.push(verdict(step, name, state, detail, awaiting))
const blocked = (step, name, detail, awaiting) => record(step, name, 'blocked', detail, awaiting)

const BUILD_AWAIT =
  '两个应用成员的构建产物：pnpm --filter @omne-harness/harness-server build' +
  ' 与 pnpm --filter @omne-harness/cli build'

function tamperProof(proof) {
  const last = proof.slice(-1)
  return `${proof.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
}

async function main() {
  const missing = missingBuild()
  if (missing.length > 0) {
    for (const [step, name] of STEPS) blocked(step, name, '构建产物不在，无法起进程', BUILD_AWAIT)
    return
  }
  const scratch = newScratch('joint-a-refusal-')
  const argv = process.argv.slice(2)
  const keep = argv.includes('--keep')
  let handle
  try {
    const port = await freePort()
    const operatorPath = join(scratch.base, 'operator.json')
    writeJson(operatorPath, operatorLayer({ storageRoot: scratch.storageRoot, port }))
    handle = await startServer({ stateRoot: scratch.stateRoot, operatorPath, port })
    const doubles = doubleRows(handle.records())
    await run(scratch, port, doubles)
  } catch (error) {
    record('flow', '脚本跑到最后', 'fail', String(error?.stack ?? error))
  } finally {
    await handle?.kill()
    if (keep) process.stdout.write(`保留临时目录：${scratch.base}\n`)
    else scratch.remove()
  }
}

const STEPS = [
  ['S1-5', '另一租户的主体读会话被拒，拒绝与「会话不存在」逐字节相同'],
  ['S1-5', '伪造或篡改的主体被拒'],
  ['S1-5', '跨租户取 Runtime Context 被拒'],
  ['S1-5', '历史多于一页时游标跨页连续'],
  ['S1-5', '篡改的游标被拒，不返回任何条目'],
]

async function run(scratch, port, doubles) {
  const treeDouble = doubles.length > 0
  const homes = { alice: join(scratch.base, 'home-alice'), bob: join(scratch.base, 'home-bob') }
  const url = `http://127.0.0.1:${String(port)}`
  const cli = (who, args, credential) =>
    runOmne({ args, home: homes[who], server: url, cwd: scratch.base, credential })

  for (const who of ['alice', 'bob']) {
    cli(who, ['register', '--login-identifier', who], CREDENTIALS[who])
    cli(who, ['login', '--login-identifier', who], CREDENTIALS[who])
  }
  const created = cli('alice', ['create-session', '--definition', 'assistant'])
  const session = created.status === 0 ? String(created.result?.body?.session ?? '') : ''
  const aliceTenant = savedTenant(homes.alice)
  const aliceProof = savedLoginProof(homes.alice)
  const bobTenant = savedTenant(homes.bob)
  const bobProof = savedLoginProof(homes.bob)

  const cross = {
    ownerTenantReal: await post(
      port,
      SESSION_PATH,
      readHistoryRequest(aliceTenant, session, bobProof),
    ),
    ownerTenantUnknown: await post(
      port,
      SESSION_PATH,
      readHistoryRequest(aliceTenant, UNKNOWN_SESSION, bobProof),
    ),
    ownTenantReal: await post(port, SESSION_PATH, readHistoryRequest(bobTenant, session, bobProof)),
    ownTenantUnknown: await post(
      port,
      SESSION_PATH,
      readHistoryRequest(bobTenant, UNKNOWN_SESSION, bobProof),
    ),
  }
  const isUnregistered = reply => replyOf(reply)?.outcome === 'basis-unavailable'
  const allDenied =
    isDenied(cross.ownerTenantReal) &&
    isDenied(cross.ownerTenantUnknown) &&
    [cross.ownTenantReal, cross.ownTenantUnknown].every(r => isDenied(r) || isUnregistered(r))
  const sameAnswer = (a, b) => a.status === b.status && a.body === b.body
  const indistinguishable =
    sameAnswer(cross.ownerTenantReal, cross.ownerTenantUnknown) &&
    sameAnswer(cross.ownTenantReal, cross.ownTenantUnknown)
  record(
    'S1-5',
    '另一租户的主体读会话被拒，拒绝与「会话不存在」逐字节相同',
    allDenied && indistinguishable ? 'pass' : 'fail',
    `四种组合的 outcome ${Object.entries(cross)
      .map(([label, reply]) => `${label}:${String(replyOf(reply)?.outcome)}`)
      .join(' ')}；两种租户文本内各自逐字节${indistinguishable ? '相同' : '不同'}`,
  )

  const forged = {
    missing: await post(port, SESSION_PATH, {
      protocolVersion: 'session-public/1',
      messageId: 'refuse-missing-proof',
      operation: 'read-history',
      body: { tenant: aliceTenant, session, cursor: null, direction: 'forward', pageBytes: '64' },
    }),
    empty: await post(port, SESSION_PATH, readHistoryRequest(aliceTenant, session, '')),
    tampered: await post(
      port,
      SESSION_PATH,
      readHistoryRequest(aliceTenant, session, tamperProof(aliceProof)),
    ),
  }
  const forgedDenied = Object.values(forged).every(reply => !isSucceeded(reply))
  record(
    'S1-5',
    '伪造或篡改的主体被拒',
    forgedDenied ? 'pass' : 'fail',
    `缺证明 ${String(replyOf(forged.missing)?.outcome)}，空串 ${String(replyOf(forged.empty)?.outcome)}，` +
      `改一字 ${String(replyOf(forged.tampered)?.outcome)}`,
  )

  blocked(
    'S1-5',
    '跨租户取 Runtime Context 被拒',
    `树的实现计数里 runtime-context 是 ${treeDouble ? '替身' : '真件'}；` +
      '接入层没有它的公开路由，本脚本不发请求',
    'runtime-context 行换真件并经入口对象 `runtimeContextTrust` 注册（integration/session-run），' +
      '接入层给出取 Runtime Context 的路由',
  )

  if (session === '') {
    const why = '建会话没有成功，游标这一段的判据走不到'
    blocked('S1-5', '历史多于一页时游标跨页连续', why, '可用的会话')
    blocked('S1-5', '篡改的游标被拒，不返回任何条目', why, '可用的会话')
    return
  }
  await cursors(port, session, aliceTenant, aliceProof, treeDouble)
}

async function cursors(port, session, tenant, proof, treeDouble) {
  const first = await post(
    port,
    SESSION_PATH,
    readHistoryRequest(tenant, session, proof, { pageBytes: SMALL_PAGE, messageId: 'cursor-1' }),
  )
  const firstBody = replyOf(first)?.body
  const next = typeof firstBody?.next === 'string' ? firstBody.next : undefined

  if (next === undefined) {
    blocked(
      'S1-5',
      '历史多于一页时游标跨页连续',
      `首页 outcome ${String(replyOf(first)?.outcome)}，没有 next；` +
        `entries ${String(firstBody?.entries?.length ?? 0)} 条，exhausted ${String(firstBody?.exhausted)}。` +
        (treeDouble ? '会话历史由契约替身保管，一页就到底' : '历史不足一页'),
      treeDouble
        ? '真实会话提供者写出的会话日志（integration/session-run），并用 S2 的多轮输入把历史撑过一页'
        : '足够多的历史条目撑过一页',
    )
  } else {
    const second = await post(
      port,
      SESSION_PATH,
      readHistoryRequest(tenant, session, proof, { cursor: next, messageId: 'cursor-2' }),
    )
    const revisions = [
      ...(firstBody?.entries ?? []),
      ...(replyOf(second)?.body?.entries ?? []),
    ].map(entry => String(entry.revision))
    const sorted = [...revisions].sort()
    record(
      'S1-5',
      '历史多于一页时游标跨页连续',
      isSucceeded(second) &&
        revisions.length > (firstBody?.entries?.length ?? 0) &&
        revisions.join(',') === sorted.join(',')
        ? 'pass'
        : 'fail',
      `首页 ${String(firstBody?.entries?.length ?? 0)} 条，第二页 ` +
        `${String(replyOf(second)?.body?.entries?.length ?? 0)} 条，修订号 ${revisions.join(',')}`,
    )
  }

  const base = next ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  const samples = [
    `${base.slice(0, -1)}${base.slice(-1) === 'A' ? 'B' : 'A'}`,
    base.slice(0, Math.max(1, base.length - 4)),
    'not-a-cursor',
  ]
  const tampered = []
  for (const [index, cursor] of samples.entries())
    tampered.push(
      await post(
        port,
        SESSION_PATH,
        readHistoryRequest(tenant, session, proof, {
          cursor,
          messageId: `tampered-${String(index)}`,
        }),
      ),
    )
  const rejected = tampered.every(reply => !isSucceeded(reply))
  const leaked = tampered.some(reply => (replyOf(reply)?.body?.entries?.length ?? 0) > 0)
  record(
    'S1-5',
    '篡改的游标被拒，不返回任何条目',
    rejected && !leaked ? 'pass' : 'fail',
    `${next === undefined ? '没有真实的 next，篡改从固定候选起' : '从真实的 next 起'}；` +
      `三种篡改的 outcome ${tampered.map(reply => String(replyOf(reply)?.outcome)).join('/')}，` +
      `条目 ${tampered.map(reply => String(replyOf(reply)?.body?.entries?.length ?? 0)).join('/')}` +
      (treeDouble ? '（替身树上的结果；真件换上后要重跑）' : ''),
  )
}

const argv = process.argv.slice(2)
const evidenceOverride = argv.includes('--evidence')
  ? argv[argv.indexOf('--evidence') + 1]
  : undefined
await main()
process.exitCode = report('refusal', checks, evidenceDirFor('refusal', evidenceOverride), {
  failures: failureCount(checks),
  blocked: blockedCount(checks),
})
