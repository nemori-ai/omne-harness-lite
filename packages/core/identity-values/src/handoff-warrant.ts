import {
  type KeyObject,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto'
import { type OpaqueIdentifier, parseOpaqueIdentifier } from './opaque.ts'
import { type Parsed, invalidInput, isOk, ok } from './parsed.ts'
import { type AccountId, parseAccountId } from './values.ts'

/**
 * 交接凭证（data.identity-values/v1#S-35）：一步操作交给下一步的凭证，断言「我这一步已经做完」。
 * 不是身份值；交换表示与不透明标识同形（非空、首尾无空白、逐码点相等）。
 *
 * 本版走签名（Ed25519，Node 内置 crypto）：产出方持私钥、核实方持公钥；`purpose` 进载荷，
 * 两个实例（`activation`、`purge`）各一对密钥。凭证不作废、不带尝试号、不带有效期（性质 4）。
 * 核实方只核三件：存在、绑定该 AccountId、由持钥方签发（性质 5）；不解析别的领域事实（性质 6）。
 */
export type HandoffWarrant = OpaqueIdentifier<'HandoffWarrant'>

export type WarrantPurpose = 'activation' | 'purge'

export const parseHandoffWarrant = (value: unknown): Parsed<HandoffWarrant> =>
  parseOpaqueIdentifier(value, 'HandoffWarrant')

/** 密钥是部署配置输入：PEM 字符串（私钥 PKCS#8、公钥 SPKI），一次生成、持久保存、跨重启不变。 */
export interface HandoffKeyPairPem {
  readonly privateKeyPem: string
  readonly publicKeyPem: string
}

export function generateHandoffKeyPair(): HandoffKeyPairPem {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

export type SigningKey = KeyObject & { readonly __handoffSigning?: never }
export type VerificationKey = KeyObject & { readonly __handoffVerification?: never }

/** 装载时校验形状：不是 Ed25519 私钥即拒绝，持钥节点据此启动失败。 */
export function loadSigningKey(privateKeyPem: unknown): Parsed<SigningKey> {
  if (typeof privateKeyPem !== 'string' || privateKeyPem.length === 0) {
    return invalidInput('signing key: not a PEM string')
  }
  try {
    const key = createPrivateKey({ key: privateKeyPem, format: 'pem' })
    if (key.asymmetricKeyType !== 'ed25519') return invalidInput('signing key: not ed25519')
    return ok(key)
  } catch {
    return invalidInput('signing key: unparseable PEM')
  }
}

export function loadVerificationKey(publicKeyPem: unknown): Parsed<VerificationKey> {
  if (typeof publicKeyPem !== 'string' || publicKeyPem.length === 0) {
    return invalidInput('verification key: not a PEM string')
  }
  // Node 会从私钥 PEM 派生公钥；核实方拿到私钥是一次部署错误（私钥外泄），不得静默接受。
  if (publicKeyPem.includes('PRIVATE KEY')) {
    return invalidInput('verification key: a private key was supplied')
  }
  try {
    const key = createPublicKey({ key: publicKeyPem, format: 'pem' })
    if (key.asymmetricKeyType !== 'ed25519') return invalidInput('verification key: not ed25519')
    return ok(key)
  } catch {
    return invalidInput('verification key: unparseable PEM')
  }
}

const VERSION = 1

interface Payload {
  readonly v: typeof VERSION
  readonly purpose: WarrantPurpose
  readonly account: string
  readonly nonce: string
}

function encodePayload(payload: Payload): Buffer {
  // 键序固定，签名对象是这段精确字节；核实方重新编码前先解析，故不依赖调用方保持键序。
  return Buffer.from(
    JSON.stringify({
      v: payload.v,
      purpose: payload.purpose,
      account: payload.account,
      nonce: payload.nonce,
    }),
    'utf8',
  )
}

/**
 * 产出一份绑定 `boundAccountId` 与 `purpose` 的凭证。随机数只保证两份凭证不同形，不构成状态。
 */
export function issue(
  signingKey: SigningKey,
  purpose: WarrantPurpose,
  boundAccountId: AccountId,
): HandoffWarrant {
  const payload = encodePayload({
    v: VERSION,
    purpose,
    account: boundAccountId,
    nonce: randomBytes(16).toString('base64url'),
  })
  const signature = sign(null, payload, signingKey)
  return `${payload.toString('base64url')}.${signature.toString('base64url')}` as HandoffWarrant
}

export type WarrantVerification = 'ok' | 'invalid'

/**
 * 核实三件事：存在（形状合法）、绑定该 AccountId 与 purpose、由持有配对私钥的一方签发。
 * 任一不满足一律 `'invalid'`，不区分原因——区分原因会诱使核实方按原因分支。
 */
export function verifyWarrant(
  verificationKey: VerificationKey,
  purpose: WarrantPurpose,
  expectedAccountId: AccountId,
  warrant: unknown,
): WarrantVerification {
  const parsed = parseHandoffWarrant(warrant)
  if (!isOk(parsed)) return 'invalid'
  const parts = parsed.ok.split('.')
  if (parts.length !== 2) return 'invalid'
  const [payloadText, signatureText] = parts as [string, string]
  let payloadBytes: Buffer
  let signature: Buffer
  try {
    payloadBytes = Buffer.from(payloadText, 'base64url')
    signature = Buffer.from(signatureText, 'base64url')
  } catch {
    return 'invalid'
  }
  if (payloadBytes.toString('base64url') !== payloadText) return 'invalid'
  let payload: unknown
  try {
    payload = JSON.parse(payloadBytes.toString('utf8'))
  } catch {
    return 'invalid'
  }
  if (typeof payload !== 'object' || payload === null) return 'invalid'
  const record = payload as Record<string, unknown>
  if (record['v'] !== VERSION) return 'invalid'
  if (record['purpose'] !== purpose) return 'invalid'
  const account = parseAccountId(record['account'])
  if (!isOk(account) || account.ok !== expectedAccountId) return 'invalid'
  let signatureValid = false
  try {
    signatureValid = verify(null, payloadBytes, verificationKey, signature)
  } catch {
    signatureValid = false
  }
  return signatureValid ? 'ok' : 'invalid'
}

export const handoffWarrant = {
  issue,
  verify: verifyWarrant,
  generateKeyPair: generateHandoffKeyPair,
  loadSigningKey,
  loadVerificationKey,
  parse: parseHandoffWarrant,
} as const
