// 部署密钥：起 Context 之前的配对自检（design「配对自检：起 Context 之前签一次、核一次」）与一次性生成（「keygen 与重生的后果」）。
// 四个原语全是 identity-values 已有的公开入口；本模块不新增能力，只核「跨插件的配对」这一件事。
import { mkdir, open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type AccountId,
  type WarrantPurpose,
  generateHandoffKeyPair,
  isOk,
  issueHandoffWarrant,
  loadSigningKey,
  loadVerificationKey,
  parseAccountId,
  unwrap,
  verifyHandoffWarrant,
} from '@omne-harness-lite/identity-values'
import { type DeploymentKeyPems, ENV, FILE_SUFFIX } from './config.ts'
import { HostStartupFailure } from './failure.ts'

/** 自检凭证绑定的一次性探针账号：一个合法的 AccountId 字面，只在此处使用，凭证不落库、不外流。 */
const PROBE_ACCOUNT_ID: AccountId = unwrap(parseAccountId('tenancy-host-key-pairing-probe'))

interface KeyPair {
  readonly purpose: WarrantPurpose
  readonly signingVariable: string
  readonly verificationVariable: string
  readonly signingPem: string
  readonly verificationPem: string
}

function pairsOf(keys: DeploymentKeyPems): readonly KeyPair[] {
  return [
    {
      purpose: 'activation',
      signingVariable: ENV.activationSigningKey,
      verificationVariable: ENV.activationVerificationKey,
      signingPem: keys.activationSigningKeyPem,
      verificationPem: keys.activationVerificationKeyPem,
    },
    {
      purpose: 'purge',
      signingVariable: ENV.purgeSigningKey,
      verificationVariable: ENV.purgeVerificationKey,
      signingPem: keys.purgeSigningKeyPem,
      verificationPem: keys.purgeVerificationKeyPem,
    },
  ]
}

/**
 * 两对各签一次、核一次：私钥签出的凭证公钥核不过 ⇒ 不配对 ⇒ 启动失败，点名是哪一对。
 * 形状（Ed25519、PEM）在这里先 load 一遍是自检的前提；政策上的形状校验仍归三个插件各自的 Config。
 */
export function verifyKeyPairing(keys: DeploymentKeyPems): void {
  for (const pair of pairsOf(keys)) {
    const signing = loadSigningKey(pair.signingPem)
    if (!isOk(signing))
      throw new HostStartupFailure(
        'key-pairing',
        `${pair.signingVariable}: not an Ed25519 private key (PEM PKCS#8)`,
        { item: pair.signingVariable },
      )
    const verification = loadVerificationKey(pair.verificationPem)
    if (!isOk(verification))
      throw new HostStartupFailure(
        'key-pairing',
        `${pair.verificationVariable}: not an Ed25519 public key (PEM SPKI)`,
        { item: pair.verificationVariable },
      )
    const warrant = issueHandoffWarrant(signing.ok, pair.purpose, PROBE_ACCOUNT_ID)
    if (verifyHandoffWarrant(verification.ok, pair.purpose, PROBE_ACCOUNT_ID, warrant) !== 'ok')
      throw new HostStartupFailure(
        'key-pairing',
        `the ${pair.purpose} key pair does not match: ${pair.signingVariable} and ${pair.verificationVariable} are not two halves of one key pair`,
        { item: pair.purpose },
      )
  }
}

/** keygen 写出的四份文件名，与各自对应的 `_FILE` 变量。 */
export const KEY_FILES = {
  activationSigningKey: {
    file: 'activation-signing-key.pem',
    variable: `${ENV.activationSigningKey}${FILE_SUFFIX}`,
  },
  activationVerificationKey: {
    file: 'activation-verification-key.pem',
    variable: `${ENV.activationVerificationKey}${FILE_SUFFIX}`,
  },
  purgeSigningKey: {
    file: 'purge-signing-key.pem',
    variable: `${ENV.purgeSigningKey}${FILE_SUFFIX}`,
  },
  purgeVerificationKey: {
    file: 'purge-verification-key.pem',
    variable: `${ENV.purgeVerificationKey}${FILE_SUFFIX}`,
  },
} as const

export type KeyFileName = keyof typeof KEY_FILES

/** 生成结果：四份文件的路径，按 `_FILE` 变量名给出，运维者照抄进部署配置。 */
export type GeneratedKeyFiles = Readonly<Record<string, string>>

export class KeyFilesExist extends Error {
  override readonly name = 'KeyFilesExist'
}

/**
 * 一次性生成两对 Ed25519 部署密钥，写四份 PEM 文件（`0600`）。目录不存在即以 `0700` 建出；
 * 四份里任一已存在 ⇒ 一份都不写、拒绝（不覆盖：重生密钥等于换钥，已签发未核实的凭证一律核不过）。
 * 不读任何配置、不连库。本版不轮换。
 */
export async function generateKeyFiles(directory: string): Promise<GeneratedKeyFiles> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const activation = generateHandoffKeyPair()
  const purge = generateHandoffKeyPair()
  const contents: Record<KeyFileName, string> = {
    activationSigningKey: activation.privateKeyPem,
    activationVerificationKey: activation.publicKeyPem,
    purgeSigningKey: purge.privateKeyPem,
    purgeVerificationKey: purge.publicKeyPem,
  }
  const names = Object.keys(KEY_FILES) as KeyFileName[]
  // 以排他方式逐个创建：任一已存在 ⇒ 删掉本次建出的、拒绝，不留半套
  const created: string[] = []
  try {
    for (const name of names) {
      const path = join(directory, KEY_FILES[name].file)
      let handle
      try {
        handle = await open(path, 'wx', 0o600)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
          throw new KeyFilesExist(
            `${KEY_FILES[name].file} already exists; refusing to overwrite deployment keys`,
          )
        throw error
      }
      created.push(path)
      try {
        await handle.writeFile(contents[name], 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
    }
  } catch (error) {
    for (const path of created) await rm(path, { force: true })
    throw error
  }
  const result: Record<string, string> = {}
  for (const name of names) result[KEY_FILES[name].variable] = join(directory, KEY_FILES[name].file)
  return result
}
