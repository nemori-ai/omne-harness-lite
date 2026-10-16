import { contractSource } from './fixtures/contract-sources.ts'
import { describe, expect, it } from 'vitest'
import { type SourceFile } from '@omne-harness/repo-toolchain'
import {
  aiR8NoCredentialInWrite,
  noPresentationInDiagnostics,
  noRandomSourceInline,
} from '../src/rules/index.ts'

const AI = 'tenancy/account-identity-sql/src/'
const file = (path: string, text: string): SourceFile => ({ path, text })

const plugin = file(`${AI}plugin.ts`, 'const deps = { random: cryptoRandomSource }\n')

describe('no-presentation-in-diagnostics', () => {
  it('出示物进日志、emit、new Error(、defect( 的实参（含模板插值）⇒ 报出', () => {
    const bad = file(
      `${AI}logins.ts`,
      [
        "this.deps.diagnostics.warn('issued', { presentation })", // 1
        'ctx.logger.info(`issued ${presentation}`)', // 2
        "ctx.emit('login.issued', { value: issued.presentation })", // 3
        'throw new Error(`bad presentation ${p}`)', // 4：p 标注为出示物
        'function f(p: LoginStatePresentation) {}', // 5
        "throw defect('x', fresh)", // 6：fresh 由 generatePresentation 得来
        'const fresh = generatePresentation(this.deps.random)', // 7
        "logger.error('%s', parsed)", // 8：parsed 由 parseLoginStatePresentation 得来
        'const parsed = parseLoginStatePresentation(raw)', // 9
      ].join('\n'),
    )
    expect(noPresentationInDiagnostics.check([bad]).map(v => v.line)).toEqual([1, 2, 3, 4, 6, 8])
  })

  it('合规：诊断只写种类与原因；字面量里的字样不算；出示物交给返回值与解析不算', () => {
    const clean = file(
      `${AI}logins.ts`,
      [
        "this.deps.diagnostics.error('random-source-unavailable', { cause: describeError(error) })",
        "throw new RangeError('presentation: wrong number of bytes')",
        'return succeed({ presentation, loginStateId })',
        'const loginStateId = deriveLoginStateId(presentation)',
        "logger.warn('%s %o', event, fields ?? {})",
      ].join('\n'),
    )
    expect(noPresentationInDiagnostics.check([clean])).toEqual([])
  })

  it('变异核对：在工具夹具的 logins.ts 的随机源失败日志里带上出示物 ⇒ 报出；原文无违反', () => {
    const original = contractSource(`${AI}logins.ts`)
    expect(noPresentationInDiagnostics.check([original])).toEqual([])
    const anchor = "this.deps.diagnostics.error('random-source-unavailable', {"
    expect(original.text).toContain(anchor)
    const mutated = file(
      original.path,
      original.text.replace(anchor, `${anchor} leaked: presentation,`),
    )
    expect(noPresentationInDiagnostics.check([mutated])).toHaveLength(1)
  })
})

describe('no-random-source-inline', () => {
  it('Math.random、出示物模块外的 randomBytes、插件体传别的源 ⇒ 报出', () => {
    const bad = file(
      `${AI}logins.ts`,
      "import { randomBytes } from 'node:crypto'\nconst b = Math.random()",
    )
    const badPlugin = file(
      `${AI}plugin.ts`,
      'const deps = { random: size => new Uint8Array(size) }\n',
    )
    const shorthand = file(`${AI}plugin.ts`, 'const deps = { storage, random }\n')
    expect(
      noRandomSourceInline
        .check([bad, plugin])
        .map(v => v.line)
        .sort(),
    ).toEqual([1, 2])
    expect(noRandomSourceInline.check([badPlugin])).toHaveLength(1)
    expect(noRandomSourceInline.check([shorthand])).toHaveLength(1)
  })

  it('合规：randomBytes 在出示物模块；插件体传 cryptoRandomSource；类型位置不算', () => {
    const presentation = file(
      `${AI}presentation.ts`,
      "import { randomBytes } from 'node:crypto'\nexport const cryptoRandomSource = size => randomBytes(size)",
    )
    const deps = file(`${AI}deps.ts`, 'readonly random: RandomSource')
    expect(noRandomSourceInline.check([presentation, plugin, deps])).toEqual([])
  })

  it('包不存在 ⇒ 静默；包在而插件体模块缺席 ⇒ 报布局偏离', () => {
    expect(noRandomSourceInline.check([file('tenancy/x/src/a.ts', 'Math.random()')])).toEqual([])
    expect(noRandomSourceInline.check([file(`${AI}logins.ts`, '')])).toHaveLength(1)
  })

  it('变异核对：工具夹具的 plugin.ts 原文无违反；把随机源换成别的 ⇒ 报出', () => {
    const original = contractSource(`${AI}plugin.ts`)
    const others = ['presentation.ts', 'logins.ts', 'accounts.ts', 'deps.ts'].map(n =>
      contractSource(`${AI}${n}`),
    )
    expect(noRandomSourceInline.check([original, ...others])).toEqual([])
    expect(original.text).toContain('random: cryptoRandomSource')
    const mutated = file(
      original.path,
      original.text.replace('random: cryptoRandomSource', 'random: () => new Uint8Array(32)'),
    )
    expect(noRandomSourceInline.check([mutated])).toHaveLength(1)
  })
})

describe('ai-r8-no-credential-in-write', () => {
  it('storage.write( 回调里调 credentials.verify/derive/checkPolicy/parse ⇒ 报出', () => {
    const bad = file(
      `${AI}accounts.ts`,
      [
        'return storage.write(async tx => {', // 1
        '  const m = await credentials.derive(presented)', // 2
        '  if (await credentials.verify(m, presented)) {}', // 3
        '})', // 4
        'await this.deps.storage.write(tx => credentials.checkPolicy(p, c))', // 5
        'await storage.write(async tx => { credentials.parse(x) })', // 6
      ].join('\n'),
    )
    expect(aiR8NoCredentialInWrite.check([bad]).map(v => v.line)).toEqual([2, 3, 5, 6])
  })

  it('合规：凭据计算在写事务之前；回调里的注释与字符串不算；read 回调不在此列', () => {
    const clean = file(
      `${AI}accounts.ts`,
      [
        'const compared = await credentials.verify(snapshot.material, presented)',
        'const derived = await credentials.derive(presented)',
        'return storage.write(async tx => {',
        '  // 这里不许 credentials.verify(（R-8）',
        "  const note = 'credentials.derive('",
        '  await tx.lockRow(ACCOUNT_TABLE, { login_identifier: id })',
        '})',
        'await storage.read(tx => credentials.verify(m, p))',
      ].join('\n'),
    )
    expect(aiR8NoCredentialInWrite.check([clean])).toEqual([])
  })

  it('变异核对：工具夹具的 accounts.ts 原文无违反；在第一个写事务回调开头调一次 credentials.derive( ⇒ 报出', () => {
    const original = contractSource(`${AI}accounts.ts`)
    expect(aiR8NoCredentialInWrite.check([original, contractSource(`${AI}logins.ts`)])).toEqual([])
    const anchor = 'return this.deps.persistence.write(async tx => {'
    expect(original.text).toContain(anchor)
    const mutated = file(
      original.path,
      original.text.replace(anchor, `${anchor}\n      await credentials.derive(presented)`),
    )
    expect(aiR8NoCredentialInWrite.check([mutated])).toHaveLength(1)
  })
})
