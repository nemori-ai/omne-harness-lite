import { describe, expect, it, vi } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import {
  attachWorkspaceSwitch,
  createSwitchWorkspaceAuthor,
  switchWorkspaceToolModule,
  workspaceSwitchOf,
  type BoundWorkspaceSwitch,
  type SwitchAnswer,
} from '@omne-harness/workspace-tools'

function scope() {
  const answer = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal: new AbortController().signal,
    process: null,
    waits: null,
  })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65536,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 8192,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

function fixture(maximum = 65536) {
  const created = createSwitchWorkspaceAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const registration = readToolRegistration(created.ok)
  if (registration?.kind !== 'function') throw new Error('function')
  const author = registration.operation.author
  if (author.kind !== 'ordinary') throw new Error('ordinary')
  const definition = deriveDefinition(
    {
      asset: { name: 'SwitchWorkspace', adoption: switchWorkspaceToolModule.executor },
      requiredCapabilities: [],
    },
    created.ok.facts,
  )
  const parse = (params: unknown) => {
    const text = JSON.stringify(params)
    return author.parameters.parse({ original: text, effective: text, complete: true })
  }
  async function run(params: unknown, bound?: BoundWorkspaceSwitch) {
    const parsed = parse(params)
    if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
    const execution = bound === undefined ? scope() : attachWorkspaceSwitch(scope(), bound)
    const result = await executeTool(parsed.ok, author.executor, null, execution)
    if ('failure' in result) throw new Error(JSON.stringify(result.failure))
    const checked = author.output.check({ arguments: parsed.ok, value: result.ok })
    if ('failure' in checked) throw new Error(JSON.stringify(checked.failure))
    return String(checked.ok)
  }
  return { definition, parse, run }
}
const answering = (answer: SwitchAnswer) => {
  const asked = vi.fn(async () => answer)
  return { bound: { switch: asked } satisfies BoundWorkspaceSwitch, asked }
}

describe('the SwitchWorkspace declaration', () => {
  it('is one function with three optional fields, and says the change takes effect from the next step', () => {
    const { definition } = fixture()
    expect(judgeToolDefinition(definition)).toHaveProperty('ok')
    if (definition.kind !== 'function') throw new Error('function')
    expect(definition.name).toBe('SwitchWorkspace')
    const declared = JSON.stringify(definition.parameters.schema)
    for (const field of ['directory', 'workspace', 'none']) expect(declared).toContain(field)
    for (const field of ['tenant', 'session', 'instance']) expect(declared).not.toContain(field)
    expect(definition.description).toContain('takes effect from your next step')
    expect(definition.declarations.environment).toBeNull()
  })

  it.each([
    [{ directory: '/work/blog' }, { kind: 'directory', directory: '/work/blog' }],
    [{ workspace: 'wsp_1' }, { kind: 'workspace', workspace: 'wsp_1' }],
    [{ none: true }, { kind: 'none' }],
  ])('reads %j as one target', (params, target) => {
    expect(fixture().parse(params)).toEqual({ ok: target })
  })

  it.each([
    [{}],
    [{ directory: '/a', none: true }],
    [{ directory: '/a', workspace: 'wsp_1' }],
    [{ workspace: 'wsp_1', none: true }],
    [{ directory: '/a', workspace: 'wsp_1', none: true }],
    [{ none: false }],
    [{ directory: '' }],
    [{ workspace: '' }],
    [{ directory: 7 }],
    [{ directory: '/a', instance: 'wsi_1' }],
    [{ directory: 'x'.repeat(4097) }],
  ])('refuses %j: exactly one well-formed target is a call', params => {
    expect(fixture().parse(params)).toMatchObject({ failure: { kind: 'invalid' } })
  })

  it('takes only resultMaxBytes as its construction', () => {
    for (const construction of [{}, { resultMaxBytes: 15 }, { resultMaxBytes: 64, other: 1 }, 7])
      expect(createSwitchWorkspaceAuthor(json(construction))).toMatchObject({
        failure: { field: 'construction' },
      })
    expect(createSwitchWorkspaceAuthor(json({ resultMaxBytes: 16 }))).toHaveProperty('ok')
  })
})

describe('a SwitchWorkspace call', () => {
  it('hands the target to the attached port, and is unavailable without one', async () => {
    const { bound, asked } = answering({ kind: 'refused', reason: 'not-permitted' })
    await fixture().run({ directory: '/work/blog' }, bound)
    expect(asked.mock.calls).toEqual([[{ kind: 'directory', directory: '/work/blog' }]])
    expect(await fixture().run({ none: true })).toBe(
      'unavailable reason=the workspace switch is not attached to this call\nIt could not be done now. Call SwitchWorkspace again later.',
    )
  })

  it('takes the port away when the execution is finished', async () => {
    const attached = attachWorkspaceSwitch(
      scope(),
      answering({ kind: 'switched', directory: null, associated: false }).bound,
    )
    expect(workspaceSwitchOf(attached.context)).toBeDefined()
    await attached.finish({ kind: 'completed' } as never)
    expect(workspaceSwitchOf(attached.context)).toBeUndefined()
  })

  it.each<[SwitchAnswer, string]>([
    [
      { kind: 'switched', directory: '/work/feature', associated: true },
      'done SwitchWorkspace directory=/work/feature associated=yes\nThis takes effect from your next step. Calls already made in this step, and any made before it ends, still run in the directory they were given.',
    ],
    [
      { kind: 'switched', directory: null, associated: false },
      'done SwitchWorkspace directory=none associated=no\nThis takes effect from your next step. Calls already made in this step, and any made before it ends, still run in the directory they were given.',
    ],
    [
      { kind: 'refused', reason: 'not-permitted' },
      'refused reason=not-permitted\nNothing changed.',
    ],
    [
      { kind: 'half-done', associated: 'wsi_7', reason: 'archived' },
      'half-done associated=wsi_7 reason=archived\nThe directory is now an instance of the workspace, but the session was not switched. Call SwitchWorkspace again with the same directory to finish.',
    ],
    [
      { kind: 'unavailable', diagnostic: 'store' },
      'unavailable reason=store\nIt could not be done now. Call SwitchWorkspace again later.',
    ],
  ])('answers %j in words the model can act on', async (answer, text) => {
    expect(await fixture().run({ none: true }, answering(answer).bound)).toBe(text)
  })

  it('says a result is too large instead of cutting it', async () => {
    const long = answering({ kind: 'refused', reason: 'x'.repeat(200) }).bound
    expect(await fixture(64).run({ none: true }, long)).toBe(
      'too-large reason=the result has 232 bytes, more than 64',
    )
    expect(await fixture(16).run({ none: true }, long)).toBe('too-large')
  })
})
