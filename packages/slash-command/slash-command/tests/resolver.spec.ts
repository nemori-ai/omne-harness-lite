import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createResolver, expandPrompt } from '@omne-harness/slash-command'
import type { CommandCatalog, CommandEntry, Taken } from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'

const asker = { principal: 'p', tenant: 't' as unknown as TenantId, session: 's' }
const ref = (name: string, unavailable?: string): CommandEntry => ({
  space: 'skill',
  name,
  kind: 'reference',
  title: name,
  ...(unavailable === undefined ? {} : { unavailable }),
})
const origin = (name: string) => ({ name, layer: 'tenant', version: '1', digest: `d-${name}` })
const body = (name: string): Taken => ({ kind: 'text', text: `正文 ${name}`, origin: origin(name) })
const entries: CommandEntry[] = [
  ref('review'),
  ref('check'),
  ref('old', '停用了'),
  { space: 'prompt', name: 'commit', kind: 'prompt', title: 'commit' },
  { space: 'omne-official', name: 'archive', kind: 'system', title: 'archive' },
]

function catalogOf(
  over: Partial<{ missing: string[]; take: CommandCatalog<string>['take'] }> = {},
) {
  const reads: number[] = []
  const takes: string[] = []
  const catalog: CommandCatalog<string> = {
    read: async () => {
      reads.push(1)
      return { catalog: { entries, missing: over.missing ?? [] }, errors: [] }
    },
    take:
      over.take ??
      (async (_who, full) => {
        takes.push(full)
        if (full === 'prompt:commit')
          return succeed({
            kind: 'text',
            text: '写提交说明：$1，备注 $ARGUMENTS',
            origin: origin(full),
          })
        if (full === 'omne-official:archive')
          return succeed({ kind: 'operation', operation: 'archive', args: '' })
        return succeed(body(full))
      }),
  }
  return { catalog, reads, takes }
}
const words = (
  text: string,
  seen: { command: string | null; references: string[] } | null = null,
) => ({ text, seen, asker })

describe('resolving a member words', () => {
  it('leaves words without a slash as they are, and reads no list', async () => {
    const { catalog, reads } = catalogOf()
    expect(await createResolver(catalog)(words('你好，没有命令'))).toEqual({
      kind: 'input',
      appended: [],
    })
    expect(reads).toEqual([])
  })

  it('appends each named body once, in the order first named, and takes nothing else', async () => {
    const { catalog, takes } = catalogOf()
    expect(
      await createResolver(catalog)(
        words('先 /review 再 /check，再 /review', {
          command: null,
          references: ['skill:review', 'skill:check'],
        }),
      ),
    ).toEqual({
      kind: 'input',
      appended: [
        { text: '正文 skill:review', origin: origin('skill:review') },
        { text: '正文 skill:check', origin: origin('skill:check') },
      ],
    })
    expect(takes).toEqual(['skill:review', 'skill:check'])
  })

  it('refuses a head that is no command, or not usable now, and what changed since it was shown', async () => {
    const resolve = createResolver(catalogOf().catalog)
    expect(await resolve(words('/nope 做'))).toEqual({
      kind: 'refused',
      reason: 'no such command: /nope',
    })
    expect(await resolve(words('/old 做'))).toEqual({
      kind: 'refused',
      reason: 'not usable now: /skill:old: 停用了',
    })
    expect(
      await resolve(words('照 /old 做', { command: null, references: ['skill:old'] })),
    ).toMatchObject({ kind: 'refused', reason: expect.stringContaining('what was shown changed') })
    expect(
      await resolve(words('没有斜杠', { command: null, references: ['skill:review'] })),
    ).toMatchObject({ kind: 'refused' })
  })

  it('refuses when a named entry went away between the list and the taking, and cannot tell when the taking fails', async () => {
    const gone = createResolver(catalogOf({ take: async () => fail('not-listed') }).catalog)
    expect(await gone(words('用 /review'))).toEqual({
      kind: 'refused',
      reason: 'what was shown changed: skill:review cannot be named now',
    })
    const down = createResolver(catalogOf({ take: async () => fail('unavailable') }).catalog)
    expect(await down(words('用 /review'))).toEqual({
      kind: 'unavailable',
      diagnostic: 'skill:review cannot be taken now',
    })
  })

  it('cannot tell with a source missing once a slash could be a candidate, and words without a candidate go on', async () => {
    const resolve = createResolver(catalogOf({ missing: ['skill'] }).catalog)
    expect(await resolve(words('用 /review'))).toMatchObject({ kind: 'unavailable' })
    expect(await resolve(words('/nope'))).toMatchObject({ kind: 'unavailable' })
    expect(await resolve(words('看 /etc/hosts'))).toEqual({ kind: 'input', appended: [] })
  })

  it('compares what was shown even without a slash, and tells a missing source only when something was named', async () => {
    const resolve = createResolver(catalogOf().catalog)
    expect(
      await resolve(words('没有斜杠', { command: 'skill:review', references: [] })),
    ).toMatchObject({ kind: 'refused', reason: expect.stringContaining('what was shown changed') })
    const missing = createResolver(catalogOf({ missing: ['skill', 'prompt'] }).catalog)
    expect(await missing(words('没有斜杠', { command: null, references: [] }))).toEqual({
      kind: 'input',
      appended: [],
    })
    expect(await missing(words('/commit 看一下'))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the list cannot be told in full: skill, prompt',
    })
  })

  it('stops at a head command that cannot be taken, and a reference that is no text', async () => {
    const gone = createResolver(catalogOf({ take: async () => fail('not-listed') }).catalog)
    expect(await gone(words('/commit x'))).toEqual({
      kind: 'refused',
      reason: 'what was shown changed: prompt:commit cannot be named now',
    })
    const odd = createResolver(
      catalogOf({ take: async () => succeed({ kind: 'operation', operation: 'x', args: '' }) })
        .catalog,
    )
    expect(await odd(words('用 /review'))).toEqual({
      kind: 'unavailable',
      diagnostic: 'skill:review is no text',
    })
  })

  it('expands a prompt command after the words, and hands a system command over as an operation', async () => {
    const resolve = createResolver(catalogOf().catalog)
    expect(await resolve(words('/commit 修复 "登录 超时"'))).toEqual({
      kind: 'input',
      appended: [
        { text: '写提交说明：修复，备注 修复 "登录 超时"', origin: origin('prompt:commit') },
      ],
    })
    expect(await resolve(words('/archive'))).toEqual({
      kind: 'operation',
      name: 'omne-official:archive',
      operation: 'archive',
      args: '',
    })
  })
})

describe('expanding a prompt', () => {
  it.each([
    ['写 $1 与 $2', 'a "b c"', '写 a 与 b c'],
    ['全部：$ARGUMENTS', 'x y', '全部：x y'],
    ['少了：$3', 'x', '少了：'],
    ['没有占位', 'x y', '没有占位\n\nx y'],
    ['没有占位', '', '没有占位'],
    ['原样：$1', 'a"b', '原样：a"b'],
    ['空的：[$1]', '', '空的：[]'],
  ])('%j with %j is %j', (prompt, args, wanted) => expect(expandPrompt(prompt, args)).toBe(wanted))
})
