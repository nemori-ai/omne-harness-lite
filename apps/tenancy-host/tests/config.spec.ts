// config 与密钥（verification：assembly.missing-key-fails-boot、assembly.invalid-config-fails-boot、
// assembly.key-pairing-mismatch-fails-boot、密钥生成函数的单元测试、assembly.clock-ready-timeout ①）。
import { generateKeyPairSync } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  generateHandoffKeyPair,
  isOk,
  loadSigningKey,
  loadVerificationKey,
} from '@omne-harness-lite/identity-values'
import {
  DISPOSE_TIMEOUT_MS,
  DRAIN_TIMEOUT_MS,
  ENV,
  HOST_VERSION,
  HostStartupFailure,
  KEY_FILES,
  KeyFilesExist,
  assertTimeoutBudget,
  generateKeyFiles,
  verifyKeyPairing,
} from '../src/index.ts'
import {
  type Deployment,
  PARAMETERS,
  deployment,
  sidecarsOf,
  tempDirectory,
} from './support/deployment.ts'
import { Hosts, failureRecords, noneActive } from './support/host.ts'
import { REGISTER, bodyOf, envelope, tlsExchange, unixExchange } from './support/wire.ts'

const hosts = new Hosts()
afterEach(() => hosts.stopAll())

const KEY_VARIABLES = [
  ENV.activationSigningKey,
  ENV.activationVerificationKey,
  ENV.purgeSigningKey,
  ENV.purgeVerificationKey,
] as const

const PEM_HEADER = '-----BEGIN'

/** 断言一次拒绝：阶段、点名的项、说明里没有任何 PEM 与所给的值、没有 fiber 留在 ACTIVE、库未被打开或已关。 */
async function expectRefusal(
  d: Deployment,
  expected: { stage: string; item: string },
  secretValues: readonly string[] = [],
) {
  const refused = await hosts.refuse(d)
  expect(refused.failure.stage).toBe(expected.stage)
  expect(refused.failure.item).toBe(expected.item)
  const records = failureRecords(refused.log)
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ stage: expected.stage, item: expected.item })
  const output = refused.log.text() + refused.failure.message
  expect(output).not.toContain(PEM_HEADER)
  for (const value of secretValues) expect(output).not.toContain(value)
  expect(noneActive(refused.fibers)).toBe(true)
  return refused
}

describe('assembly.missing-key-fails-boot：四份部署密钥各五种坏法', () => {
  for (const variable of KEY_VARIABLES) {
    const isPrivate = variable.includes('SIGNING')
    it(`${variable}：缺、二义、文件读不到、文件对 group／other 可读、不是 Ed25519`, async () => {
      const d = await deployment('missing-key')
      const fileVariable = `${variable}_FILE`
      const file = d.env[fileVariable]
      if (file === undefined) throw new Error('fixture: keygen did not give a file')
      const pem = readFileSync(file, 'utf8')

      // 变量与文件都缺
      d.env[fileVariable] = undefined
      await expectRefusal(d, { stage: 'config', item: variable })
      expect(sidecarsOf(d.file).db).toBe(false)

      // 两者都设（二义）
      d.env[variable] = pem
      d.env[fileVariable] = file
      await expectRefusal(d, { stage: 'config', item: variable }, [pem.split('\n')[1] ?? pem])
      d.env[variable] = undefined

      // 文件读不到
      d.env[fileVariable] = join(d.root, 'no-such-key.pem')
      await expectRefusal(d, { stage: 'config', item: fileVariable }, ['no-such-key.pem'])

      // 文件对 group／other 可读
      d.env[fileVariable] = file
      chmodSync(file, 0o640)
      await expectRefusal(d, { stage: 'config', item: fileVariable })
      chmodSync(file, 0o600)

      // 内容不是 Ed25519（RSA）
      const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      const rsaPem = isPrivate
        ? rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
        : rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      writeFileSync(file, rsaPem)
      await expectRefusal(d, { stage: 'key-pairing', item: variable }, [
        rsaPem.split('\n')[1] ?? '',
      ])
      expect(sidecarsOf(d.file).db).toBe(false)
    })
  }
})

describe('assembly.key-pairing-mismatch-fails-boot：四份各自合法、但不配对 ⇒ 起插件之前拒绝', () => {
  async function swapped(mutate: (d: Deployment) => void, pair: 'activation' | 'purge') {
    const d = await deployment('pairing')
    mutate(d)
    const refused = await expectRefusal(d, { stage: 'key-pairing', item: pair })
    expect(refused.fibers).toEqual([]) // 一条插件 fiber 都没建
    expect(sidecarsOf(d.file).db).toBe(false) // 库文件未被打开
  }

  it('① activation 私钥配另一次 keygen 的 activation 公钥', async () => {
    const other = generateHandoffKeyPair()
    await swapped(d => {
      d.env[`${ENV.activationVerificationKey}_FILE`] = undefined
      d.env[ENV.activationVerificationKey] = other.publicKeyPem
    }, 'activation')
  })

  it('② activation 与 purge 的公钥互换', async () => {
    await swapped(d => {
      const a = d.env[`${ENV.activationVerificationKey}_FILE`]
      d.env[`${ENV.activationVerificationKey}_FILE`] = d.env[`${ENV.purgeVerificationKey}_FILE`]
      d.env[`${ENV.purgeVerificationKey}_FILE`] = a
    }, 'activation')
  })

  it('③ 两把私钥互换', async () => {
    await swapped(d => {
      const a = d.env[`${ENV.activationSigningKey}_FILE`]
      d.env[`${ENV.activationSigningKey}_FILE`] = d.env[`${ENV.purgeSigningKey}_FILE`]
      d.env[`${ENV.purgeSigningKey}_FILE`] = a
    }, 'activation')
  })

  it('反向：配对正确 ⇒ 自检通过、不留任何凭证', () => {
    const activation = generateHandoffKeyPair()
    const purge = generateHandoffKeyPair()
    expect(() =>
      verifyKeyPairing({
        activationSigningKeyPem: activation.privateKeyPem,
        activationVerificationKeyPem: activation.publicKeyPem,
        purgeSigningKeyPem: purge.privateKeyPem,
        purgeVerificationKeyPem: purge.publicKeyPem,
      }),
    ).not.toThrow()
    // purge 一对不配 ⇒ 点名 purge
    expect(() =>
      verifyKeyPairing({
        activationSigningKeyPem: activation.privateKeyPem,
        activationVerificationKeyPem: activation.publicKeyPem,
        purgeSigningKeyPem: purge.privateKeyPem,
        purgeVerificationKeyPem: generateHandoffKeyPair().publicKeyPem,
      }),
    ).toThrow(expect.objectContaining({ stage: 'key-pairing', item: 'purge' }) as Error)
  })
})

describe('assembly.invalid-config-fails-boot：每一项坏法都启动失败、点名那一项、不含值', () => {
  const cases: {
    readonly title: string
    readonly mutate: (d: Deployment) => void
    readonly stage: string
    readonly item: string
    readonly value?: string
  }[] = [
    {
      title: 'unactivatedRetention 为 0',
      mutate: d => void (d.env[ENV.unactivatedRetention] = '0'),
      stage: 'config',
      item: ENV.unactivatedRetention,
    },
    {
      title: 'invitationTtlDefault 为负',
      mutate: d => void (d.env[ENV.invitationTtlDefault] = '-5'),
      stage: 'config',
      item: ENV.invitationTtlDefault,
    },
    {
      title: 'affiliationRequestTtlDefault 不是时长',
      mutate: d => void (d.env[ENV.affiliationRequestTtlDefault] = 'soon-ish'),
      stage: 'config',
      item: ENV.affiliationRequestTtlDefault,
      value: 'soon-ish',
    },
    {
      title: 'teamCreationKeyRetention 缺',
      mutate: d => void (d.env[ENV.teamCreationKeyRetention] = undefined),
      stage: 'config',
      item: ENV.teamCreationKeyRetention,
    },
    {
      title: 'OMNE_TENANCY_STORAGE_FILE 为 :memory:（storage-sql 的 Config 拒）',
      mutate: d => void (d.env[ENV.storageFile] = ':memory:'),
      stage: 'plugin',
      item: 'storage-sql',
    },
    {
      title: 'OMNE_TENANCY_STORAGE_FILE 缺',
      mutate: d => void (d.env[ENV.storageFile] = undefined),
      stage: 'config',
      item: ENV.storageFile,
    },
    {
      title: '方言不认识',
      mutate: d => void (d.env[ENV.storageDialect] = 'oracle-9i'),
      stage: 'config',
      item: ENV.storageDialect,
      value: 'oracle-9i',
    },
    {
      title: 'pg 方言缺连接串',
      mutate: d => void (d.env[ENV.storageDialect] = 'postgres'),
      stage: 'config',
      item: ENV.storageUrl,
    },
    {
      title: 'CREDENTIAL_POLICY 不是合法 JSON',
      mutate: d => void (d.env[ENV.credentialPolicy] = '{"minLength": s3cret'),
      stage: 'config',
      item: ENV.credentialPolicy,
      value: 's3cret',
    },
    {
      title: 'PF-003 部署参数 copyNoticeTtlDefault 缺',
      mutate: d => void (d.env[ENV.copyNoticeTtlDefault] = undefined),
      stage: 'config',
      item: ENV.copyNoticeTtlDefault,
    },
    {
      title: 'PF-003 部署参数 sharingInvitationTtlDefault 非正',
      mutate: d => void (d.env[ENV.sharingInvitationTtlDefault] = '0'),
      stage: 'config',
      item: ENV.sharingInvitationTtlDefault,
    },
    {
      title: 'ENTRY_LISTEN 缺',
      mutate: d => void (d.env[ENV.entryListen] = undefined),
      stage: 'config',
      item: ENV.entryListen,
    },
    {
      title: 'ENTRY_LISTEN 不是 host:port',
      mutate: d => void (d.env[ENV.entryListen] = 'localhost:99999'),
      stage: 'config',
      item: ENV.entryListen,
      value: '99999',
    },
    {
      title: 'TLS 证书链两个来源都缺',
      mutate: d => void (d.env[ENV.entryTlsCertChain] = undefined),
      stage: 'config',
      item: ENV.entryTlsCertChain,
    },
    {
      title: 'TLS 私钥两个来源都设',
      mutate: d => void (d.env[ENV.entryTlsPrivateKey] = 'inline-tls-key-text'),
      stage: 'config',
      item: ENV.entryTlsPrivateKey,
      value: 'inline-tls-key-text',
    },
    {
      title: 'TLS 私钥文件对 group／other 可读',
      mutate: d => chmodSync(d.env[`${ENV.entryTlsPrivateKey}_FILE`] ?? '', 0o644),
      stage: 'config',
      item: `${ENV.entryTlsPrivateKey}_FILE`,
    },
    {
      title: 'OPS_SOCKET_DIR 缺',
      mutate: d => void (d.env[ENV.opsSocketDirectory] = undefined),
      stage: 'config',
      item: ENV.opsSocketDirectory,
    },
    {
      title: '等钟上界缺（assembly.clock-ready-timeout ①）',
      mutate: d => void (d.env[ENV.clockReadyTimeout] = undefined),
      stage: 'config',
      item: ENV.clockReadyTimeout,
    },
    {
      title: '等钟上界不大于租约宽度（assembly.clock-ready-timeout ①）',
      mutate: d => void (d.env[ENV.clockReadyTimeout] = '10000'),
      stage: 'config',
      item: ENV.clockReadyTimeout,
    },
  ]
  for (const c of cases) {
    it(c.title, async () => {
      const d = await deployment('invalid')
      c.mutate(d)
      await expectRefusal(
        d,
        { stage: c.stage, item: c.item },
        c.value === undefined ? [] : [c.value],
      )
      // config 层的失败连库文件都没碰；插件 Config 的失败在打开之前（storage-sql Config 先于打开）
      expect(sidecarsOf(d.file).db).toBe(false)
    })
  }

  it('排空上界不小于撤除总超时 ⇒ 启动失败（两个都是常量：这里核判据本身与常量取值）', () => {
    expect(() => assertTimeoutBudget({ drainTimeoutMs: 30_000, disposeTimeoutMs: 30_000 })).toThrow(
      HostStartupFailure,
    )
    expect(() =>
      assertTimeoutBudget({
        drainTimeoutMs: DRAIN_TIMEOUT_MS,
        disposeTimeoutMs: DISPOSE_TIMEOUT_MS,
      }),
    ).not.toThrow()
  })

  it('反向：credentialPolicy 缺席 ⇒ 启动成功（契约 S-27 的例外），注册得 credential-rejected', async () => {
    const d = await deployment('no-policy')
    d.env[ENV.credentialPolicy] = undefined
    const { host } = await hosts.start(d)
    const reply = await tlsExchange(
      d.port,
      envelope(REGISTER, {
        loginIdentifier: 'ada@example.invalid',
        credential: 'correct horse battery',
      }),
    )
    expect(bodyOf(reply)).toEqual({ failure: 'credential-rejected' })
    expect(host.fibers['account-identity']?.config).toMatchObject({ credentialPolicy: undefined })
  })

  it('反向：五项部署参数与运维面完整体检里的 deploymentParameters 逐项相等（同一组值只解析一次）', async () => {
    const d = await deployment('parameters')
    const { host } = await hosts.start(d)
    const health = bodyOf(await unixExchange(d.socketPath))
    expect(health).toMatchObject({
      deploymentKeyPresent: true,
      deploymentKeyComplete: true,
      deploymentParameters: PARAMETERS,
      version: HOST_VERSION,
    })
    expect(host.fibers['account-identity']?.config).toMatchObject({
      unactivatedRetention: PARAMETERS.unactivatedRetention,
    })
    expect(host.fibers['organization-governance']?.config).toMatchObject({
      invitationTtlDefault: PARAMETERS.invitationTtlDefault,
      affiliationRequestTtlDefault: PARAMETERS.affiliationRequestTtlDefault,
    })
  })

  it('HOST_VERSION 与 package.json 的版本一致（构建常量）', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as {
      version: string
    }
    expect(HOST_VERSION).toBe(pkg.version)
  })
})

describe('密钥生成函数 generateKeyFiles（keygen）', () => {
  it('产出四份文件、0600、各自被 load*Key 接受、两对互相配对、两对不相同；目录已有文件时拒绝覆盖', async () => {
    const directory = join(tempDirectory('keygen'), 'keys')
    const files = await generateKeyFiles(directory)
    expect(statSync(directory).mode & 0o777).toBe(0o700)
    const read = (name: keyof typeof KEY_FILES) => {
      const path = files[KEY_FILES[name].variable]
      if (path === undefined) throw new Error(`no ${name}`)
      expect(statSync(path).mode & 0o777).toBe(0o600)
      return readFileSync(path, 'utf8')
    }
    const keys = {
      activationSigningKeyPem: read('activationSigningKey'),
      activationVerificationKeyPem: read('activationVerificationKey'),
      purgeSigningKeyPem: read('purgeSigningKey'),
      purgeVerificationKeyPem: read('purgeVerificationKey'),
    }
    expect(isOk(loadSigningKey(keys.activationSigningKeyPem))).toBe(true)
    expect(isOk(loadSigningKey(keys.purgeSigningKeyPem))).toBe(true)
    expect(isOk(loadVerificationKey(keys.activationVerificationKeyPem))).toBe(true)
    expect(isOk(loadVerificationKey(keys.purgeVerificationKeyPem))).toBe(true)
    expect(() => verifyKeyPairing(keys)).not.toThrow()
    expect(keys.activationSigningKeyPem).not.toBe(keys.purgeSigningKeyPem)

    const before = readFileSync(join(directory, KEY_FILES.activationSigningKey.file), 'utf8')
    await expect(generateKeyFiles(directory)).rejects.toBeInstanceOf(KeyFilesExist)
    expect(readFileSync(join(directory, KEY_FILES.activationSigningKey.file), 'utf8')).toBe(before)
  })

  it('四份里只有一份已存在 ⇒ 一份都不留下（不留半套）', async () => {
    const directory = tempDirectory('keygen-partial')
    writeFileSync(join(directory, KEY_FILES.purgeVerificationKey.file), 'occupied', { mode: 0o600 })
    await expect(generateKeyFiles(directory)).rejects.toBeInstanceOf(KeyFilesExist)
    for (const name of [
      'activationSigningKey',
      'activationVerificationKey',
      'purgeSigningKey',
    ] as const)
      expect(existsSync(join(directory, KEY_FILES[name].file))).toBe(false)
  })
})
