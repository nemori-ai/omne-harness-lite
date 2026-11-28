import { describe, expect, it } from 'vitest'
import { GOAL_USAGE } from '@omne-harness/goal-contract'
import { readJsonText } from '@omne-harness/json-text'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  commandArguments,
  commandGuide,
  deriveDefinition,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import {
  answerGoal,
  createGoalAuthor,
  EXAMINING_CONDITIONS,
  goalCommandNames,
  goalExecutor,
  goalToolModule,
  PROPOSE_CONDITIONS,
} from '../src/index.ts'
import { DRAFT } from './world.ts'

const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 262_144,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 65_536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

function author(maximum = 65_536) {
  const created = createGoalAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const read = readToolRegistration(created.ok)
  if (read?.kind !== 'commands') throw new Error('commands')
  const registration = read
  const definition = deriveDefinition(
    { asset: { name: 'Goal', adoption: goalToolModule.executor }, requiredCapabilities: [] },
    created.ok.facts,
  )
  function decode(command: string, params: unknown) {
    const operation = registration.operations.find(([name]) => name === command)?.[1]
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    if ('failure' in cut) return cut
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    return operation.author.parameters.parse(cut.ok)
  }
  return { definition, decode, registration }
}

describe('the Goal declaration', () => {
  it('is one wrapped declaration of six commands, none of which sets, changes, pauses, resumes, cancels or settles a goal', () => {
    const { definition } = author()
    expect(judgeToolDefinition(definition)).toHaveProperty('ok')
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.encoding).toBe('wrapped')
    const ALL = ['help', 'show', 'propose', 'track', 'brief', 'submit']
    expect(definition.commands.map(item => item.name)).toEqual(ALL)
    expect(goalCommandNames).toEqual(ALL)
    for (const name of ALL)
      expect(name).not.toMatch(/set|revise|pause|resume|cancel|settle|achieve/u)
    expect(definition.backgroundAllowed).toBe(false)
  })

  it('offers brief and submit only in a session that examines for a goal, the working commands only in one that does not, and propose only where a person attends as well', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const conditions = Object.fromEntries(
      definition.commands.map(item => [item.name, item.conditions ?? null]),
    )
    expect(conditions).toEqual({
      help: null,
      show: ['working'],
      propose: ['person-present', 'working'],
      track: ['working'],
      brief: ['examining'],
      submit: ['examining'],
    })
    expect(PROPOSE_CONDITIONS).toEqual(['person-present', 'working'])
    expect(EXAMINING_CONDITIONS).toEqual(['examining'])
  })

  it('does not vary with what it is constructed with, and refuses a construction it does not know', () => {
    expect(author(64).definition).toEqual(author(1_048_576).definition)
    expect(createGoalAuthor(json({ resultMaxBytes: 8 }))).toHaveProperty('failure')
    expect(createGoalAuthor(json({ resultMaxBytes: 64, shell: 'zsh' }))).toHaveProperty('failure')
  })

  it('help answers the guide of the tool, which is the one usage text, and of one command with its schema', async () => {
    const context = { signal: new AbortController().signal }
    const whole = await answerGoal({ command: 'help', params: {} }, context)
    if (!('ok' in whole)) throw new Error('help')
    expect(whole.ok.startsWith('done Goal help\n')).toBe(true)
    expect(whole.ok).toContain(GOAL_USAGE)
    for (const name of goalCommandNames) expect(whole.ok).toContain(`${name} `)
    const one = await answerGoal({ command: 'help', params: { name: 'propose' } }, context)
    if (!('ok' in one)) throw new Error('help')
    expect(one.ok).toContain('"changes"')
    expect(one.ok).toContain('"purpose"')
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(commandGuide(definition, undefined)).toContain(GOAL_USAGE)
  })

  it('takes a body or changes for propose, never both and never neither; a field it does not know is invalid', () => {
    const { decode } = author()
    expect(decode('propose', { body: DRAFT })).toMatchObject({ ok: { command: 'propose' } })
    const changes = [{ op: 'remove', id: 'N1' }]
    expect(decode('propose', { changes })).toMatchObject({ ok: { params: { changes } } })
    for (const params of [{}, { body: DRAFT, changes }])
      expect(decode('propose', params)).toMatchObject({
        failure: { kind: 'invalid', reason: expect.stringContaining('not both and not neither') },
      })
    expect(decode('propose', { body: { ...DRAFT, mood: 'good' } })).toMatchObject({
      failure: { kind: 'invalid', reason: expect.stringContaining('body') },
    })
    expect(decode('show', { session: 'another' })).toMatchObject({ failure: { kind: 'invalid' } })
    expect(decode('track', { notes: ['a'] })).toMatchObject({ ok: { command: 'track' } })
    expect(decode('track', { state: 'paused' })).toMatchObject({ failure: { kind: 'invalid' } })
  })
})

describe('the executor and the bound of a result', () => {
  const context = { signal: new AbortController().signal } as never
  it('a completed call returns its text; a failed one throws its reason; propose does not run through it', async () => {
    expect(await goalExecutor.execute({ command: 'help', params: {} }, null, context)).toContain(
      'done Goal help',
    )
    await expect(
      goalExecutor.execute({ command: 'show', params: {} }, null, context),
    ).rejects.toThrow('the goal services are not attached to this call')
    await expect(
      goalExecutor.execute({ command: 'propose', params: {} } as never, null, context),
    ).rejects.toThrow('propose runs through its checkpoint executor')
  })
  it('a result is text, and no longer than the bound the author was constructed with', () => {
    const operation = author(64).registration.operations.find(([name]) => name === 'show')?.[1]
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    const { output, codec } = operation.author
    expect(output.check({ value: 'x'.repeat(64) } as never)).toEqual({ ok: 'x'.repeat(64) })
    expect(output.check({ value: 'x'.repeat(65) } as never)).toHaveProperty('failure')
    expect(output.check({ value: '字'.repeat(22) } as never)).toHaveProperty('failure')
    expect(output.check({ value: 5 } as never)).toHaveProperty('failure')
    const bytes = codec.encode('目标' as never)
    if (!('ok' in bytes)) throw new Error('encode')
    expect(codec.decode(bytes.ok as never)).toEqual({ ok: '目标' })
    expect(codec.encode(5 as never)).toEqual({ failure: { reason: 'text-required' } })
    expect(codec.decode(new Uint8Array([0xff]) as never)).toEqual({
      failure: { reason: 'invalid-utf8' },
    })
  })
})
