// 凭据提供者SPEC及本包verification的验证义务。
// 包内能证的逐条是真实测试；归别处的写成带指向的 it.skip。
import { describe, expect, it } from 'vitest'
import { scryptSync } from 'node:crypto'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { isOk } from '@omne-harness-lite/identity-values'
import { CREDENTIALS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import {
  type CredentialMaterial,
  type CredentialsService,
  type PresentedCredential,
} from '@omne-harness-lite/account-identity'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification-scrypt/cordis'
import { createPasswordCredentials } from '../src/service.ts'

/** 测试用低代价参数：只为跑得快，行为与缺省参数相同。 */
const FAST = { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 }
const credentials: CredentialsService = createPasswordCredentials(FAST)

function presented(raw: string): PresentedCredential {
  const parsed = credentials.parse(raw)
  if (!isOk(parsed)) throw new Error('fixture credential must parse')
  return parsed.ok
}

async function derived(raw: string): Promise<CredentialMaterial> {
  const material = await credentials.derive(presented(raw))
  if (material === 'unavailable') throw new Error('fixture derive must succeed')
  return material
}

/** Preserved faulty observer, used only to reproduce IR-CC-1's short encoded collision. */
function legacySubstringMatch(haystack: string, secret: string): string | undefined {
  for (let length = secret.length; length >= 3; length -= 1) {
    for (let start = 0; start + length <= secret.length; start += 1) {
      const piece = secret.slice(start, start + length)
      if (haystack.includes(piece)) return piece
    }
  }
  return undefined
}

function containsPlaintext(output: unknown, secret: string): boolean {
  return (JSON.stringify(output) ?? '').includes(secret)
}

describe('credential-verification · 证据义务', () => {
  it('S-8：材料只含 PHC 字段，无完整明文；同一输入两次派生不相等（盐）', async () => {
    const secret = 'Correct-Horse-Battery-Staple-密码'
    const first = await derived(secret)
    const second = await derived(secret)
    for (const material of [first, second]) {
      expect(containsPlaintext(material, secret)).toBe(false)
      expect(material).toMatch(
        /^\$password-scrypt\$v=1\$n=1024,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/,
      )
      const fields = material.split('$')
      expect(Buffer.from(fields[4]!, 'base64url')).toHaveLength(16)
      expect(Buffer.from(fields[5]!, 'base64url')).toHaveLength(32)
    }
    expect(first).not.toBe(second)
    // 两份材料都能比对回同一明文：不同只来自盐
    expect(await credentials.verify(first, presented(secret))).toBe('match')
    expect(await credentials.verify(second, presented(secret))).toBe('match')
  })

  it('IR-CC-1: a fixed salt encoding collides with rec without storing readable credentials', async () => {
    const secret = 'Correct-Horse-Battery-Staple-密码'
    const salt = Buffer.from('ade70000000000000000000000000000', 'hex')
    const hash = scryptSync(secret, salt, 32, { N: 1024, r: 8, p: 1 })
    const material =
      `$password-scrypt$v=1$n=1024,r=8,p=1$${salt.toString('base64url')}$${hash.toString('base64url')}` as CredentialMaterial
    expect(legacySubstringMatch(material, secret)).toBe('rec')
    expect(containsPlaintext(material, secret)).toBe(false)
    expect(await credentials.verify(material, presented(secret))).toBe('match')
    expect(await credentials.verify(material, presented('incorrect'))).toBe('mismatch')
  })

  it('the plaintext observer rejects seeded material, record, event and diagnostic leaks', () => {
    const secret = 'Correct-Horse-Battery-Staple-密码'
    for (const output of [
      secret,
      { credential: secret },
      { args: [secret] },
      { message: secret },
    ]) {
      expect(containsPlaintext(output, secret)).toBe(true)
    }
    expect(containsPlaintext({ diagnostic: 'credentials-unavailable' }, secret)).toBe(false)
  })

  it('材料自描述：参数写在材料里，换了派生参数的实例仍按材料里的参数比对', async () => {
    const material = await derived('s3cret-pass')
    expect(material.startsWith('$password-scrypt$v=1$n=1024,r=8,p=1$')).toBe(true)
    const other = createPasswordCredentials({ ...FAST, cost: 2048, keyBytes: 48 })
    expect(await other.verify(material, presented('s3cret-pass'))).toBe('match')
  })

  it('verify 三值：正确 ⇒ match；错误 ⇒ mismatch；scheme 不认识 ⇒ mismatch；参数损坏 ⇒ unavailable', async () => {
    const material = await derived('right-password')
    expect(await credentials.verify(material, presented('right-password'))).toBe('match')
    expect(await credentials.verify(material, presented('wrong-password'))).toBe('mismatch')

    const [, , version, params, salt, hash] = material.split('$')
    const unknownScheme = ['', 'argon2id', version, params, salt, hash].join(
      '$',
    ) as CredentialMaterial
    expect(await credentials.verify(unknownScheme, presented('right-password'))).toBe('mismatch')
    const notPhc = 'plaintext-looking-material' as CredentialMaterial
    expect(await credentials.verify(notPhc, presented('right-password'))).toBe('mismatch')

    // 同一方案、参数损坏：N 不是 2 的幂、参数段缺项、盐不是 base64url、内存超上界——都是「比不了」，不是「不匹配」
    const damaged = [
      material.replace('n=1024', 'n=1000'),
      material.replace(',p=1', ''),
      ['', 'password-scrypt', version, params, '***', hash].join('$'),
      material.replace('n=1024,r=8', 'n=1048576,r=32'),
      ['', 'password-scrypt', 'v=9', params, salt, hash].join('$'),
    ] as CredentialMaterial[]
    for (const bad of damaged) {
      expect(await credentials.verify(bad, presented('right-password'))).toBe('unavailable')
    }
    // 运行期拿到的不是字符串（绕过类型的调用方）⇒ 比不了
    expect(await credentials.verify(42 as unknown as CredentialMaterial, presented('x'))).toBe(
      'unavailable',
    )
  })

  it('S-26：政策不合形状 ⇒ unavailable；不满足规则 ⇒ rejected 携理由；满足 ⇒ ok', () => {
    const policy = { minLength: 12, requiredCharacterClasses: ['digit', 'uppercase'] }
    expect(credentials.checkPolicy(policy, presented('Abcdefghijk1'))).toBe('ok')
    expect(credentials.checkPolicy(policy, presented('abcdefghijk1'))).toEqual({
      rejected: 'character-class:uppercase',
    })
    expect(credentials.checkPolicy(policy, presented('Ab1'))).toEqual({
      rejected: 'min-length:12',
    })
    expect(credentials.checkPolicy(policy, presented('short'))).toEqual({
      rejected: 'min-length:12,character-class:digit,character-class:uppercase',
    })
    // 长度按 Unicode 标量值计，不按 UTF-16 码元
    expect(credentials.checkPolicy({ minLength: 3 }, presented('𝒜𝒜'))).toEqual({
      rejected: 'min-length:3',
    })
    // 理由只指认规则，不带凭据本身
    const rejected = credentials.checkPolicy(policy, presented('leaky-secret'))
    expect(JSON.stringify(rejected)).not.toContain('leaky-secret')

    for (const malformed of [
      undefined,
      null,
      'strict',
      {},
      { minLength: 0 },
      { minLength: 8, unknownRule: true },
      { minLength: 8, requiredCharacterClasses: ['emoji'] },
    ]) {
      expect(credentials.checkPolicy(malformed, presented('whatever-long-enough'))).toBe(
        'unavailable',
      )
    }
  })

  it('parse：缺席、空串、非字符串 ⇒ invalidInput；非空字符串原样通过', () => {
    for (const raw of [undefined, null, '', 42, {}, ['a']]) {
      expect(isOk(credentials.parse(raw))).toBe(false)
    }
    const parsed = credentials.parse(' 带空白也照收 ')
    expect(parsed).toEqual({ ok: ' 带空白也照收 ' })
  })

  it('插件：config 合法 ⇒ provide credentials；撤除后服务消失', async () => {
    const assembly = await bootAssembly({
      plugins: [{ plugin: credentialsPlugin, config: { cost: 1024 } }],
    })
    const service = assembly.ctx.get(CREDENTIALS_SERVICE) as CredentialsService
    const material = await service.derive(presented('plugin-pass'))
    expect(material).not.toBe('unavailable')
    await assembly.dispose()
    expect(assembly.ctx.get(CREDENTIALS_SERVICE)).toBeUndefined()
  })

  it('插件：派生参数非法（N 不是 2 的幂、盐短于 16 字节、多余成员）⇒ 启动失败', async () => {
    for (const config of [{ cost: 1000 }, { saltBytes: 8 }, { cost: 1024, pepper: 'x' }]) {
      await expect(
        bootAssembly({ plugins: [{ plugin: credentialsPlugin, config }] }),
      ).rejects.toThrow()
    }
  })

  it.skip('SC-CV-1：account-identity 包不访问 CredentialMaterial 内部字段——归 W2-C（tools/ts-checks 规则）', () => {})

  it.skip('换代演练：卸载本插件、装载另一实现，account-identity 与 organization-governance 的 fiber 不重跑——归 W3-A（tenancy-host 装配组合验证）', () => {})
})
