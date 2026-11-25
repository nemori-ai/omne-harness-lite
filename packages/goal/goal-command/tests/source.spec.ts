import { describe, expect, it } from 'vitest'
import { GOAL_USAGE } from '@omne-harness/goal-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createCommandCatalog, createResolver } from '@omne-harness/slash-command'
import {
  type EntrySource,
  judgeListing,
  RESERVED_SPACE,
} from '@omne-harness/slash-command-contract'
import {
  createGoalCommandSource,
  GOAL_COMMAND_PROMPT,
  GOAL_COMMAND_SOURCE,
  GOAL_COMMAND_SPACE,
} from '../src/index.ts'

const asker = { principal: 'p', tenant: 't' as unknown as TenantId, session: 's' }
const source = createGoalCommandSource<string>()
const naming = (name: string) => ({ name, args: '', request: 'req-1' })
const reserved: EntrySource<string> = {
  name: 'session-commands',
  space: RESERVED_SPACE,
  list: async () =>
    succeed([{ space: RESERVED_SPACE, name: 'model', kind: 'system', title: '换模型' }]),
  take: async () => fail('not-listed'),
}

describe('the official entrance source of goals', () => {
  it('hands out one prompt command in a namespace of its own, and nothing else', async () => {
    expect([source.name, source.space]).toEqual([GOAL_COMMAND_SOURCE, GOAL_COMMAND_SPACE])
    expect([source.name, source.space]).toEqual(['goal-command', 'goal'])
    const listed = await source.list(asker, new AbortController().signal)
    expect(listed).toEqual({
      ok: [
        {
          space: 'goal',
          name: 'goal',
          kind: 'prompt',
          title: '给这段会话设一个目标',
          hint: '想做成什么',
        },
      ],
    })
    expect(await source.take(asker, naming('pause'), new AbortController().signal)).toEqual({
      failure: 'not-listed',
    })
  })

  it('its prompt is the one usage text of goals after one line that says a goal is asked for', async () => {
    const taken = await source.take(asker, naming('goal'), new AbortController().signal)
    if (!('ok' in taken) || taken.ok.kind !== 'text') throw new Error('no text')
    expect(taken.ok.text).toBe(GOAL_COMMAND_PROMPT)
    expect(taken.ok.text.endsWith(GOAL_USAGE)).toBe(true)
    expect(taken.ok.text.slice(0, -GOAL_USAGE.length)).toBe(
      'The person asks for a goal for this session. What they wrote with the command says what they want.\n\n',
    )
    expect(taken.ok.origin).toMatchObject({ name: 'goal:goal', layer: 'official', version: '1' })
    expect(taken.ok.origin.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
  })

  it('beside the commands of the reserved namespace, /goal is listed, taken by its short name, and what the person wrote follows the prompt', async () => {
    const sources = [
      { source: reserved, official: true },
      { source, official: true },
    ]
    const catalog = createCommandCatalog<string>({
      sources: () => sources,
      declared: ['session-commands', 'goal-command'],
      timeoutMs: 1000,
    })
    const read = await catalog.read(asker)
    expect(read.errors).toEqual([])
    expect(read.catalog.missing).toEqual([])
    const listed = read.catalog.entries.map(entry => `${entry.space}:${entry.name}:${entry.kind}`)
    expect(listed).toContain('goal:goal:prompt')
    const resolve = createResolver(catalog)
    const resolved = await resolve({
      text: '/goal 把首页加载降下来',
      seen: null,
      asker,
      request: 'req-1',
    })
    expect(resolved).toMatchObject({
      kind: 'input',
      appended: [
        { text: `${GOAL_COMMAND_PROMPT}\n\n把首页加载降下来`, origin: { name: 'goal:goal' } },
      ],
    })
  })

  it('its listing stands by the rules of a source that is official', async () => {
    const listed = await source.list(asker, new AbortController().signal)
    if (!('ok' in listed)) throw new Error('no listing')
    const judged = judgeListing({ source, official: true }, listed.ok)
    expect(judged).toEqual({ ok: listed.ok })
  })
})
