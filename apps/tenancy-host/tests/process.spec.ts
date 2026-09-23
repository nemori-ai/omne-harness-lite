// 真子进程（verification：assembly.upgrade-crash-recovery、assembly.no-commit-before-open ②、交错 I-9 两进程属主排他与
// clock 租约同一文件、两进程同时 boot()、进程入口 serve／keygen 与信号、AI S-32 完整进程重启）。
// 「崩溃」一律是 SIGKILL：不走任何撤除。sqlite 临时文件库。
import { chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { LoginsService } from '@omne-harness-lite/account-identity'
import { ENV } from '../src/index.ts'
import {
  type Deployment,
  centerIdOf,
  deployment,
  dumpDatabase,
  query,
  sidecarsOf,
  tablesOf,
  tempDirectory,
} from './support/deployment.ts'
import { Hosts } from './support/host.ts'
import { type HostProcess, spawnCli, spawnHost } from './support/process.ts'
import {
  LOGIN,
  PUBLIC_HEALTH_BODY,
  REGISTER,
  bodyOf,
  envelope,
  tlsExchange,
  unixExchange,
} from './support/wire.ts'

const hosts = new Hosts()
const children: HostProcess[] = []
const restores: (() => void)[] = []
afterEach(async () => {
  for (const child of children.splice(0)) await child.kill()
  for (const restore of restores.splice(0)) restore()
  await hosts.stopAll()
})

function track(child: HostProcess): HostProcess {
  children.push(child)
  return child
}

const PASSWORD = 'correct horse battery'

async function seeded(label: string): Promise<{ d: Deployment; centerId: string }> {
  const d = await deployment(label)
  const { host } = await hosts.start(d)
  expect(
    bodyOf(
      await tlsExchange(
        d.port,
        envelope(REGISTER, { loginIdentifier: 'ada@example.invalid', credential: PASSWORD }),
      ),
    ),
  ).toEqual({ result: 'registered' })
  await hosts.stop(host)
  return { d, centerId: host.serving.centerId }
}

describe('assembly.upgrade-crash-recovery：启动途中崩溃', () => {
  it('迁移中途（快照已建、第一条新迁移已提交）SIGKILL ⇒ 下一次启动先恢复遗留快照、按升级前的库照常起来', async () => {
    const { d, centerId } = await seeded('crash-migrating')
    const before = dumpDatabase(d.file)
    const child = track(spawnHost({ env: d.env, extra: ['upgrade_probe', 'hang'] }))
    await child.until('migrating')
    await child.kill()
    expect(sidecarsOf(d.file).snapshot).toBe(true)
    const { host } = await hosts.start(d)
    expect(host.serving.centerId).toBe(centerId)
    expect(sidecarsOf(d.file).snapshot).toBe(false)
    await hosts.stop(host)
    const after = dumpDatabase(d.file)
    expect(after.schema).toEqual(before.schema)
    expect(tablesOf(d.file)).not.toContain('upgrade_probe')
  })

  it('迁移之后、确认之前 SIGKILL ⇒ 同上；恢复本身失败（快照所在目录只读）⇒ 启动失败于遗留快照恢复、写出快照位置、快照仍在', async () => {
    const { d, centerId } = await seeded('crash-before-confirm')
    const child = track(
      spawnHost({ env: d.env, extra: ['upgrade_probe'], stopAt: 'before-confirm' }),
    )
    await child.until('before-confirm')
    await child.kill()
    const snapshot = `${d.file}.upgrade-snapshot`
    expect(existsSync(snapshot)).toBe(true)

    chmodSync(d.root, 0o500)
    restores.push(() => chmodSync(d.root, 0o700))
    const refused = await hosts.refuse(d)
    expect(refused.failure).toMatchObject({ stage: 'restore', snapshot })
    expect(refused.failure.message).toContain(snapshot)
    expect(existsSync(snapshot)).toBe(true)

    chmodSync(d.root, 0o700)
    const { host } = await hosts.start(d)
    expect(host.serving.centerId).toBe(centerId)
    expect(existsSync(snapshot)).toBe(false)
    expect(tablesOf(d.file)).not.toContain('upgrade_probe')
  })
})

describe('assembly.no-commit-before-open ②：确认之前 SIGKILL，没有任何答复见过被撤回的值', () => {
  it('非首次：停在确认处时客户端与运维面都问不到；杀掉之后下一次启动恢复遗留快照，库与升级前逐表相等', async () => {
    const { d } = await seeded('kill-at-confirm')
    const before = dumpDatabase(d.file)
    const child = track(
      spawnHost({ env: d.env, extra: ['upgrade_probe'], stopAt: 'before-confirm' }),
    )
    await child.until('before-confirm')
    expect((await tlsExchange(d.port, PUBLIC_HEALTH_BODY, 3_000)).bytes.length).toBe(0)
    expect((await unixExchange(d.socketPath, 3_000)).bytes.length).toBe(0)
    await child.kill()
    const { host } = await hosts.start(d)
    await hosts.stop(host)
    const after = dumpDatabase(d.file)
    expect(after.schema).toEqual(before.schema)
    const { clock_lease: _a, ...afterRows } = after.rows
    const { clock_lease: _b, ...beforeRows } = before.rows
    expect(afterRows).toEqual(beforeRows)
  })

  it('首次：停在确认处时标识已铸进库、但没有任何答复带出它；杀掉之后下一次仍是第一次，标识被重铸', async () => {
    const d = await deployment('kill-first')
    const child = track(spawnHost({ env: d.env, stopAt: 'before-confirm' }))
    await child.until('before-confirm')
    const minted = centerIdOf(d.file)
    expect(minted).not.toBeNull()
    const health = await tlsExchange(d.port, PUBLIC_HEALTH_BODY, 3_000)
    expect(health.bytes.length).toBe(0)
    await child.kill()
    const { host } = await hosts.start(d)
    expect(host.confirmation.snapshotTaken).toBe(true) // 「库不存在」的快照被恢复成库不存在，这一次还是第一次
    expect(host.serving.centerId).not.toBe(minted)
  })
})

describe('交错 I-9：两进程属主排他，clock 租约在同一文件', () => {
  it('两进程同时 boot() 同一份库 ⇒ 恰一个起来、另一个于「被占」拒绝；A 撤除后 B 起来，startedAt 不早于 A 最后写下的 lease_until', async () => {
    const d = await deployment('two-processes')
    const a = track(spawnHost({ env: d.env }))
    const b = track(spawnHost({ env: d.env }))
    const outcomes = await Promise.all([
      Promise.race([a.until('serving'), a.until('failed')]),
      Promise.race([b.until('serving'), b.until('failed')]),
    ])
    const winner = outcomes[0].startsWith('serving') ? a : b
    const loserLine = outcomes[0].startsWith('serving') ? outcomes[1] : outcomes[0]
    expect(outcomes.filter(o => o.startsWith('serving'))).toHaveLength(1)
    expect(loserLine).toBe('failed occupied')

    winner.send('dispose')
    await winner.until('disposed true')
    await winner.exited()
    const [lease] = query<{ lease_until: number; written_at: number }>(
      d.file,
      'SELECT lease_until, written_at FROM clock_lease',
    )
    if (lease === undefined) throw new Error('no clock lease')

    const next = track(spawnHost({ env: d.env }))
    const line = await next.until('serving')
    const startedAt = Number(line.split(' ')[2])
    expect(startedAt).toBeGreaterThanOrEqual(lease.lease_until)
  })

  it('A 在役时 B 起不来（被占），B 的失败不碰数据；A 的中心照常答复', async () => {
    const { d, centerId } = await seeded('occupied')
    const a = track(spawnHost({ env: d.env }))
    await a.until('serving')
    const b = track(
      spawnHost({
        env: {
          ...d.env,
          [ENV.entryListen]: `127.0.0.1:0`,
          [ENV.opsSocketDirectory]: tempDirectory('ops-b'),
        },
      }),
    )
    expect(await b.until('failed')).toBe('failed occupied')
    expect(bodyOf(await tlsExchange(d.port, PUBLIC_HEALTH_BODY))).toMatchObject({ centerId })
  })
})

describe('进程入口（src/cli.ts）', () => {
  it('serve：起来之后 SIGTERM ⇒ 逆序撤除、退出 0；标准错误流是逐行 JSON，含 serving 与 disposed', async () => {
    const d = await deployment('cli-serve')
    const child = track(spawnCli(['serve'], d.env))
    await child.untilStderr('"event":"serving"')
    expect(bodyOf(await tlsExchange(d.port, PUBLIC_HEALTH_BODY))).toMatchObject({ reachable: true })
    child.signal('SIGTERM')
    expect(await child.exited()).toBe(0)
    const lines = child
      .stderr()
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(lines.find(l => l['event'] === 'disposed')).toMatchObject({ complete: true })
    expect(existsSync(d.socketPath)).toBe(false)
  })

  it('serve 启动失败 ⇒ 退出 1，标准错误流里恰一条 startup-failed', async () => {
    const d = await deployment('cli-fail')
    d.env[ENV.clockReadyTimeout] = '5'
    const child = track(spawnCli(['serve'], d.env))
    expect(await child.exited()).toBe(1)
    const failures = child
      .stderr()
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .filter(l => l['event'] === 'startup-failed')
    expect(failures).toEqual([
      expect.objectContaining({ stage: 'config', item: ENV.clockReadyTimeout }),
    ])
  })

  it('keygen <dir>：写四份文件、标准输出给出 _FILE 变量；同一目录再跑一次 ⇒ 退出 1、不覆盖；缺参数 ⇒ 退出 2', async () => {
    const directory = join(tempDirectory('cli-keygen'), 'keys')
    const first = track(spawnCli(['keygen', directory], {}))
    expect(await first.exited()).toBe(0)
    const again = track(spawnCli(['keygen', directory], {}))
    expect(await again.exited()).toBe(1)
    expect(again.stderr()).toContain('KeyFilesExist')
    const usage = track(spawnCli(['keygen'], {}))
    expect(await usage.exited()).toBe(2)
    for (const name of ['activation-signing-key.pem', 'purge-verification-key.pem'])
      expect(existsSync(join(directory, name))).toBe(true)
  })
})

describe('AI S-32 的完整进程重启（另起一个 Node 进程打开同一库）', () => {
  it('进程一签发并撤销一个登录状态、SIGTERM 退出；进程二里 logins.verify 得 login-state-rejected', async () => {
    const d = await deployment('s32-process')
    const child = track(spawnCli(['serve'], d.env))
    await child.untilStderr('"event":"serving"')
    expect(
      bodyOf(
        await tlsExchange(
          d.port,
          envelope(REGISTER, { loginIdentifier: 'eve@example.invalid', credential: PASSWORD }),
        ),
      ),
    ).toEqual({ result: 'registered' })
    const session = (
      bodyOf(
        await tlsExchange(
          d.port,
          envelope(LOGIN, { loginIdentifier: 'eve@example.invalid', credential: PASSWORD }),
        ),
      ) as {
        result: { loginState: string; loginStateHandle: string }
      }
    ).result
    const revoked = await tlsExchange(
      d.port,
      JSON.stringify({
        protocolVersion: '1',
        presentedLoginState: session.loginState,
        operation: 'capability.account-identity/v2#S-16',
        payload: { loginStateHandle: session.loginStateHandle },
      }),
    )
    expect(bodyOf(revoked)).toEqual({ result: 'ok' })
    child.signal('SIGTERM')
    expect(await child.exited()).toBe(0)

    const { host } = await hosts.start(d)
    const logins = host.context.get('logins') as LoginsService
    expect(await logins.verify(session.loginStateHandle as never)).toEqual({
      failure: 'login-state-rejected',
    })
  })
})
