// 密码方案 `password-scrypt`：材料的派生、自描述编码与比对。
// 节点设计：packages/tenancy/credential-verification-scrypt/SPEC.md Cordis 的投影」。
// 材料只含方案、参数、盐与哈希，不含明文（S-8 第 1 条）；参数写进材料，比对按材料里的参数做，
// 所以换 config 不影响已存材料的比对。
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type {
  PresentedCredential,
  CredentialMaterial,
  VerifyResult,
} from '@omne-harness-lite/account-identity'

export const PASSWORD_SCRYPT_SCHEME = 'password-scrypt'
const FORMAT_VERSION = 1

/** 单次计算的内存上界（128·N·r）。config 与材料里的参数都受它约束：一份参数离谱的材料是「比不了」，不是一次大内存分配。 */
export const MAX_SCRYPT_MEMORY_BYTES = 512 * 1024 * 1024
const MAX_COST = 2 ** 20
const MAX_BLOCK_SIZE = 32
const MAX_PARALLELIZATION = 16

export interface ScryptParameters {
  /** N：CPU／内存代价，2 的幂。 */
  readonly cost: number
  /** r：块大小。 */
  readonly blockSize: number
  /** p：并行度。 */
  readonly parallelization: number
}

export interface DerivationParameters extends ScryptParameters {
  readonly saltBytes: number
  readonly keyBytes: number
}

/** 参数合法：N 为 ≥ 2 的 2 的幂、各项在上界内、内存不超过 {@link MAX_SCRYPT_MEMORY_BYTES}。 */
export function scryptParametersValid(params: ScryptParameters): boolean {
  const { cost, blockSize, parallelization } = params
  return (
    Number.isSafeInteger(cost) &&
    cost >= 2 &&
    cost <= MAX_COST &&
    (cost & (cost - 1)) === 0 &&
    Number.isSafeInteger(blockSize) &&
    blockSize >= 1 &&
    blockSize <= MAX_BLOCK_SIZE &&
    Number.isSafeInteger(parallelization) &&
    parallelization >= 1 &&
    parallelization <= MAX_PARALLELIZATION &&
    memoryOf(params) <= MAX_SCRYPT_MEMORY_BYTES
  )
}

function memoryOf(params: ScryptParameters): number {
  return 128 * params.cost * params.blockSize
}

function scryptAsync(
  presented: PresentedCredential,
  salt: Buffer,
  keyBytes: number,
  params: ScryptParameters,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      Buffer.from(presented, 'utf8'),
      salt,
      keyBytes,
      {
        N: params.cost,
        r: params.blockSize,
        p: params.parallelization,
        // Node 的判据是「约 128·N·r 超过 maxmem 即报错」；留一倍余量，上界已由参数校验收住
        maxmem: 2 * memoryOf(params),
      },
      (error, key) => (error === null ? resolve(key) : reject(error)),
    )
  })
}

/** 派生一份新材料；随机源或计算失败 ⇒ `unavailable`，不返回半份材料。 */
export async function deriveMaterial(
  presented: PresentedCredential,
  params: DerivationParameters,
): Promise<CredentialMaterial | 'unavailable'> {
  let salt: Buffer
  let hash: Buffer
  try {
    salt = randomBytes(params.saltBytes)
    hash = await scryptAsync(presented, salt, params.keyBytes, params)
  } catch {
    return 'unavailable'
  }
  return encodeMaterial(params, salt, hash)
}

/** 自描述编码（PHC 字符串的形状）：`$password-scrypt$v=1$n=<N>,r=<r>,p=<p>$<salt>$<hash>`，盐与哈希为 base64url 无填充。 */
function encodeMaterial(params: ScryptParameters, salt: Buffer, hash: Buffer): CredentialMaterial {
  return [
    '',
    PASSWORD_SCRYPT_SCHEME,
    `v=${FORMAT_VERSION}`,
    `n=${params.cost},r=${params.blockSize},p=${params.parallelization}`,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$') as CredentialMaterial
}

interface DecodedMaterial {
  readonly params: ScryptParameters
  readonly salt: Buffer
  readonly hash: Buffer
}

/** 材料的方案名：`$<scheme>$…` 的第一段；认不出形状 ⇒ `undefined`。 */
export function schemeOf(material: string): string | undefined {
  if (!material.startsWith('$')) return undefined
  const end = material.indexOf('$', 1)
  return end === -1 ? undefined : material.slice(1, end)
}

const DECIMAL = /^(0|[1-9][0-9]{0,15})$/

function strictBase64url(text: string): Buffer | undefined {
  if (text.length === 0 || !/^[A-Za-z0-9_-]+$/.test(text)) return undefined
  const bytes = Buffer.from(text, 'base64url')
  return bytes.toString('base64url') === text ? bytes : undefined
}

/** 已认出是本方案的材料，按格式逐段解码；任何一段不合 ⇒ `undefined`（参数损坏，比不了）。 */
function decodeMaterial(material: string): DecodedMaterial | undefined {
  const parts = material.split('$')
  if (parts.length !== 6) return undefined
  const [, scheme, version, paramText, saltText, hashText] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  if (scheme !== PASSWORD_SCRYPT_SCHEME || version !== `v=${FORMAT_VERSION}`) return undefined
  const fields = paramText.split(',')
  if (fields.length !== 3) return undefined
  const values = new Map<string, number>()
  for (const field of fields) {
    const [key, value] = field.split('=')
    if (key === undefined || value === undefined || !DECIMAL.test(value) || values.has(key))
      return undefined
    values.set(key, Number(value))
  }
  const params: ScryptParameters = {
    cost: values.get('n') ?? Number.NaN,
    blockSize: values.get('r') ?? Number.NaN,
    parallelization: values.get('p') ?? Number.NaN,
  }
  if (!scryptParametersValid(params)) return undefined
  const salt = strictBase64url(saltText)
  const hash = strictBase64url(hashText)
  if (salt === undefined || hash === undefined || hash.length < 16) return undefined
  return { params, salt, hash }
}

/**
 * 三值比对：方案不认识 ⇒ `mismatch`（换代的产品后果，本包不静默迁移）；
 * 本方案但材料损坏或计算失败 ⇒ `unavailable`，不折成 `mismatch`。
 * 常量时间比较只是哈希比对的常规做法，不是对时序侧信道的承诺（契约 S-3）。
 */
export async function verifyMaterial(
  material: unknown,
  presented: PresentedCredential,
): Promise<VerifyResult> {
  if (typeof material !== 'string') return 'unavailable'
  if (schemeOf(material) !== PASSWORD_SCRYPT_SCHEME) return 'mismatch'
  const decoded = decodeMaterial(material)
  if (decoded === undefined) return 'unavailable'
  let computed: Buffer
  try {
    computed = await scryptAsync(presented, decoded.salt, decoded.hash.length, decoded.params)
  } catch {
    return 'unavailable'
  }
  return timingSafeEqual(computed, decoded.hash) ? 'match' : 'mismatch'
}
