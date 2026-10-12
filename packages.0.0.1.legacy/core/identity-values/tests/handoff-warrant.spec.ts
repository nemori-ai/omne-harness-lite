import { describe, expect, it } from 'vitest'
import {
  generateHandoffKeyPair,
  handoffWarrant,
  loadSigningKey,
  loadVerificationKey,
  parseAccountId,
  unwrap,
} from '../src/index.ts'

const activation = generateHandoffKeyPair()
const purge = generateHandoffKeyPair()
const sign = unwrap(loadSigningKey(activation.privateKeyPem))
const verifyKey = unwrap(loadVerificationKey(activation.publicKeyPem))
const purgeSign = unwrap(loadSigningKey(purge.privateKeyPem))
const purgeVerify = unwrap(loadVerificationKey(purge.publicKeyPem))
const alice = unwrap(parseAccountId('acc_alice'))
const bob = unwrap(parseAccountId('acc_bob'))

describe('交接凭证（S-35）', () => {
  it('正例：为 alice 签发的激活依据在 alice 上核实通过', () => {
    const warrant = handoffWarrant.issue(sign, 'activation', alice)
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, warrant)).toBe('ok')
    expect('ok' in handoffWarrant.parse(warrant)).toBe(true)
  })

  it('反例 1：不带凭证（缺席、空串、非字符串）', () => {
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, undefined)).toBe('invalid')
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, '')).toBe('invalid')
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, 42)).toBe('invalid')
  })

  it('反例 2：为另一个 AccountId 产出的凭证（性质 3）', () => {
    const forAlice = handoffWarrant.issue(sign, 'activation', alice)
    expect(handoffWarrant.verify(verifyKey, 'activation', bob, forAlice)).toBe('invalid')
  })

  it('反例 3：用途不符——清除依据拿去激活，两道都挡（不同 purpose、不同密钥）', () => {
    const purgeWarrant = handoffWarrant.issue(purgeSign, 'purge', alice)
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, purgeWarrant)).toBe('invalid')
    expect(handoffWarrant.verify(purgeVerify, 'activation', alice, purgeWarrant)).toBe('invalid')
    expect(handoffWarrant.verify(purgeVerify, 'purge', alice, purgeWarrant)).toBe('ok')
  })

  it('反例 4：换密钥签的凭证核不过', () => {
    const other = unwrap(loadSigningKey(generateHandoffKeyPair().privateKeyPem))
    const forged = handoffWarrant.issue(other, 'activation', alice)
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, forged)).toBe('invalid')
  })

  it('反例 5：改一字节即核不过（载荷或签名）', () => {
    const warrant = handoffWarrant.issue(sign, 'activation', alice) as string
    const [payload, signature] = warrant.split('.') as [string, string]
    const flip = (s: string, i: number) =>
      s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1)
    expect(
      handoffWarrant.verify(verifyKey, 'activation', alice, `${flip(payload, 3)}.${signature}`),
    ).toBe('invalid')
    expect(
      handoffWarrant.verify(verifyKey, 'activation', alice, `${payload}.${flip(signature, 3)}`),
    ).toBe('invalid')
  })

  it('反例 6：自己编的字符串——形状合法但核不过', () => {
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, 'whf_2a91c07e')).toBe('invalid')
    const fake = `${Buffer.from(JSON.stringify({ v: 1, purpose: 'activation', account: 'acc_alice', nonce: 'x' })).toString('base64url')}.${Buffer.alloc(64).toString('base64url')}`
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, fake)).toBe('invalid')
  })

  it('非规范 base64url 编码的同一载荷被拒（编码歧义不构成第二份合法凭证）', () => {
    const warrant = handoffWarrant.issue(sign, 'activation', alice) as string
    const [payload, signature] = warrant.split('.') as [string, string]
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, `${payload}=.${signature}`)).toBe(
      'invalid',
    )
  })

  it('凭证不作废：同一份重放仍核实通过（性质 4，重放安全归核实方的前置现读）', () => {
    const warrant = handoffWarrant.issue(sign, 'activation', alice)
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, warrant)).toBe('ok')
    expect(handoffWarrant.verify(verifyKey, 'activation', alice, warrant)).toBe('ok')
  })
})

describe('密钥装载：形状不对即拒绝（持钥节点据此启动失败）', () => {
  it('缺失、空串、非 PEM、非 Ed25519 都拒', () => {
    expect('invalidInput' in loadSigningKey(undefined)).toBe(true)
    expect('invalidInput' in loadSigningKey('')).toBe(true)
    expect('invalidInput' in loadSigningKey('not a key')).toBe(true)
    expect('invalidInput' in loadVerificationKey(activation.privateKeyPem)).toBe(true)
  })
  it('公钥当私钥装载被拒', () => {
    expect('invalidInput' in loadSigningKey(activation.publicKeyPem)).toBe(true)
  })
})
