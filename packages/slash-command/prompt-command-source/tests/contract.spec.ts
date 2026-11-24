import { digestBytes, type PackageReader, readBodyText } from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  promptBodyContract,
  promptCategoryDisplay,
  promptLayout,
  promptOf,
  promptProblem,
} from '@omne-harness/prompt-command-source'
import { describe, expect, it } from 'vitest'

const WHOLE = { name: 'commit', description: '写提交说明。', prompt: '为 $1 写提交说明。' }
const tree = (value: object) => {
  const read = readBodyText(JSON.stringify(value), {
    maxBytes: 9999,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 9999,
    maxNumberLength: 20,
  })
  if (read.kind !== 'ok') throw new Error('not a document')
  return read.value
}

function directory(files: Record<string, string>): PackageReader {
  const bytes = Object.fromEntries(
    Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)]),
  )
  return {
    manifest: async () =>
      succeed({
        entries: Object.entries(bytes).map(([path, data]) => ({
          path,
          bytes: data.length,
          digest: digestBytes(data),
        })),
      }) as never,
    open: async path =>
      path in bytes ? succeed(bytes[path] as Uint8Array) : fail('missing' as never),
  }
}
const file = (head: string, prompt = '为 $1 写提交说明。') => `---\n${head}\n---\n${prompt}\n`

describe('what a prompt command must be, the first thing wrong said', () => {
  it.each([
    [{ ...WHOLE }, undefined],
    [{ ...WHOLE, name: '' }, 'name is missing'],
    [{ ...WHOLE, name: 'omne-official:archive' }, 'the space omne-official is the release'],
    [{ ...WHOLE, name: 'prompt:commit' }, 'without a space and a colon'],
    [{ ...WHOLE, name: 'Commit Now' }, 'lower-case letters'],
    [{ ...WHOLE, description: ' ' }, 'description is missing'],
    [{ ...WHOLE, description: '一行\n两行' }, 'one line of at most'],
    [{ ...WHOLE, argumentHint: '<a>\n<b>' }, 'argument-hint: one line'],
    [{ ...WHOLE, prompt: '\n' }, 'the prompt is missing'],
    [{ ...WHOLE, argumentHint: '<scope>', prompt: '$1 与 $2' }, 'uses $2; argument-hint names 1'],
    [{ ...WHOLE, argumentHint: '<scope> [note]', prompt: '$1 与 $2' }, undefined],
  ])('%j: %s', (body, wanted) => {
    const problem = promptProblem(body)
    if (wanted === undefined) expect(problem).toBeUndefined()
    else expect(problem).toContain(wanted)
  })
})

describe('the directory of a prompt command', () => {
  it('reads the frontmatter and the prompt after it into the body', async () => {
    const read = await promptLayout.inspect(
      directory({
        'PROMPT.md': file('name: commit\ndescription: 写提交说明。\nargument-hint: <scope>'),
      }),
    )
    expect(read).toEqual({
      ok: tree({
        name: 'commit',
        description: '写提交说明。',
        argumentHint: '<scope>',
        prompt: '为 $1 写提交说明。',
      }),
    })
  })

  it.each([
    [{ 'NOTES.md': 'x' }, 'has no PROMPT.md'],
    [{ 'PROMPT.md': file('name: commit\ndescription: d'), 'extra.txt': 'x' }, 'also has extra.txt'],
    [{ 'PROMPT.md': '为 $1 写。' }, 'has no frontmatter'],
    [{ 'PROMPT.md': file('name: commit\ndescription: d\nmodel: x') }, 'which is not read'],
    [{ 'PROMPT.md': file('name: omne-official:x\ndescription: d') }, 'the space omne-official'],
    [{ 'PROMPT.md': file('name: commit') }, 'description is missing'],
    [{ 'PROMPT.md': file('name: commit\ndescription: d', '') }, 'the prompt is missing'],
  ])('%j is refused: %s', async (files, wanted) => {
    const read = await promptLayout.inspect(directory(files))
    expect(read).toMatchObject({ failure: { kind: 'invalid-package' } })
    expect(JSON.stringify(read)).toContain(wanted)
  })
})

describe('the example the help gives', () => {
  it('is a whole prompt command as it stands', async () => {
    const lines = (promptCategoryDisplay.authoring ?? '').split('\n')
    const from = lines.indexOf('---')
    const to = lines.indexOf('---', from + 1)
    const example = lines.slice(from, to + 2).join('\n')
    expect(await promptLayout.inspect(directory({ 'PROMPT.md': example }))).toMatchObject({
      ok: { kind: 'object' },
    })
  })
})

describe('the body contract', () => {
  const contract = promptBodyContract()
  it('takes a whole body under its own name, and refuses another name or a broken body', () => {
    expect(contract.judge(tree(WHOLE), { capabilityName: 'commit' })).toEqual({ ok: true })
    expect(contract.judge(tree(WHOLE), { capabilityName: 'other' })).toEqual({
      ok: false,
      rejected: 'name-mismatch',
    })
    expect(contract.judge(tree({ ...WHOLE, prompt: '' }))).toEqual({
      ok: false,
      rejected: 'invalid-prompt-command',
    })
    expect(contract.judge(tree({ ...WHOLE, extra: 'x' }))).toMatchObject({ ok: false })
    expect(contract.judge(tree({ ...WHOLE, name: 1 }))).toMatchObject({ ok: false })
    expect(contract.judge(WHOLE)).toMatchObject({ ok: false })
    expect(promptOf(tree({ ...WHOLE, manifest: { files: [] } }))).toEqual(WHOLE)
    const elsewhere = {
      kind: 'object',
      entries: Object.entries(WHOLE).map(([key, value]) => ({
        key,
        value: { kind: 'string', value },
      })),
    }
    expect(promptOf(elsewhere)).toEqual(WHOLE)
    expect(contract.summarize?.(tree(WHOLE))).toEqual({
      title: 'commit',
      description: '写提交说明。',
      facts: [{ name: '参数', text: '无' }],
    })
    expect(contract.layout?.namespace).toBe('prompts')
  })
})
