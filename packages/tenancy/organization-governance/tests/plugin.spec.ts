// 插件装卸：config 配错 ⇒ 启动失败（不做成运行期 unavailable）；必需 inject 缺一个 ⇒ PENDING、四个面不可见；撤除 ⇒ 服务消失、事实留在存储里。
import { afterEach, describe, expect, it } from 'vitest'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATIONS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
  organizationGovernancePlugin,
} from '../src/index.ts'
import {
  AccountsStandIn,
  LoginsStandIn,
  TestClock,
  bootOg,
  countRows,
  registeredUser,
  storageConfig,
  tempSqliteFile,
} from './support.ts'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
})

async function services() {
  const storage = await openStorage(storageConfig(tempSqliteFile('plugin')))
  closers.push(() => storage.close())
  const clock = new TestClock()
  return [
    { name: 'storage', value: storage },
    { name: 'clock', value: clock },
    { name: 'accounts', value: new AccountsStandIn(storage, clock) },
    { name: 'logins', value: new LoginsStandIn(storage) },
  ]
}

const keys = generateHandoffKeyPair()
const goodConfig = {
  invitationTtlDefault: 'P7D',
  affiliationRequestTtlDefault: 3 * 86_400_000,
  teamCreationKeyRetention: 'PT24H',
  purgeSigningKeyPem: keys.privateKeyPem,
}

describe('organization-governance 插件', () => {
  it('config 各项配错都是启动失败：非正时长、缺项、多余项、缺私钥、交了公钥', async () => {
    const bad: Record<string, unknown>[] = [
      { ...goodConfig, invitationTtlDefault: 0 },
      { ...goodConfig, affiliationRequestTtlDefault: 'P0D' },
      { ...goodConfig, teamCreationKeyRetention: -1 },
      { ...goodConfig, purgeSigningKeyPem: undefined },
      { ...goodConfig, purgeSigningKeyPem: keys.publicKeyPem },
      { ...goodConfig, purgeSigningKeyPem: 'not a pem' },
      { ...goodConfig, extra: true },
    ]
    for (const config of bad) {
      await expect(
        bootAssembly({
          services: await services(),
          plugins: [{ plugin: organizationGovernancePlugin, config }],
        }),
        JSON.stringify(Object.keys(config)),
      ).rejects.toThrow()
    }
  })

  it('ISO 8601 与毫秒两种时长写法都接受；四个面都 provide', async () => {
    const assembly = await bootAssembly({
      services: await services(),
      plugins: [{ plugin: organizationGovernancePlugin, config: goodConfig }],
    })
    closers.push(() => assembly.dispose())
    for (const name of [
      ORGANIZATIONS_SERVICE,
      MEMBERSHIPS_SERVICE,
      OFFERS_SERVICE,
      ORGANIZATION_PURGE_SERVICE,
    ]) {
      expect(assembly.ctx.get(name), name).toBeDefined()
    }
  })

  it('必需 inject 缺 accounts ⇒ PENDING（装配报清单错误），四个面都不可见', async () => {
    const withoutAccounts = (await services()).filter(s => s.name !== 'accounts')
    await expect(
      bootAssembly({
        services: withoutAccounts,
        plugins: [{ plugin: organizationGovernancePlugin, config: goodConfig }],
      }),
    ).rejects.toThrow(/PENDING/)
  })

  it('撤除 ⇒ 服务消失；全部事实留在存储里，同一个库再装一次照常认回', async () => {
    const h = await bootOg()
    const user = await registeredUser(h)
    await h.assembly.dispose()
    expect(h.assembly.ctx.get(ORGANIZATIONS_SERVICE)).toBeUndefined()
    const again = await bootOg({ file: h.file })
    closers.push(() => again.dispose())
    closers.push(() => h.raw.close())
    expect(await again.organizations.createPersonal(user.account)).toEqual({
      ok: { organization: user.personal.organization, tenant: user.personal },
    })
    expect(await countRows(again, 'organization')).toBe(1)
  })
})
