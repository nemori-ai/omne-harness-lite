import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveLocations } from '../../src/local/locations.ts'
import { localOperatorLayer } from '../../src/local/operator-defaults.ts'
import { captureShellEnvironment } from '../../src/local/settings.ts'
import {
  fittingStep,
  generatedText,
  parseModelScript,
  scriptedAnswer,
  withCompactionTrigger,
  withModelRoute,
  type ModelScript,
} from '../../src/lab/model-gateway/script.ts'
import { distributionPath } from '../r9/support.ts'

const chat = (...texts: string[]) =>
  JSON.stringify({ model: 'openai/m', messages: texts.map(content => ({ role: 'user', content })) })
const asked = (body: string) => ({
  index: 0,
  body,
  rawBody: body,
  path: '/api/v1/chat/completions',
})
const frames = (body: string): unknown[] =>
  body
    .split('\n\n')
    .filter(part => part.startsWith('data: ') && part !== 'data: [DONE]')
    .map(part => JSON.parse(part.slice(6)) as unknown)

const SCRIPT: ModelScript = parseModelScript(
  JSON.stringify({
    steps: [
      {
        when: { has: ['整理待办'], lacks: ['call_list'] },
        call: [{ id: 'call_list', tool: 'Files', arguments: { command: 'list', params: {} } }],
      },
      { when: { has: ['整理待办', 'call_list'] }, say: '整理好了。' },
      { when: {}, say: '我在。' },
    ],
    judgings: [
      { when: { has: ['还没做完'] }, criterion: 'no-evidence' },
      { when: {}, criterion: 'holds', rule: 'kept', exit: 0.02 },
    ],
  }),
)

describe('the text a script generates', () => {
  it('has exactly the bytes asked for, whatever the size, and is the same for the same seed', () => {
    for (const bytes of [1, 2, 7, 256, 4096, 65_537])
      expect(Buffer.byteLength(generatedText(3, bytes))).toBe(bytes)
    expect(generatedText(3, 4096)).toBe(generatedText(3, 4096))
    expect(generatedText(3, 4096)).not.toBe(generatedText(4, 4096))
  })

  it('is plain words: it holds no digit and no mark a script could find its steps by', () => {
    expect(generatedText(1, 8192)).toMatch(/^[a-z ]+\.$/u)
  })

  it('is whole words of a small vocabulary with one space between them, cut where the bytes end', () => {
    const words = generatedText(1, 8192).slice(0, -1).split(' ')
    const whole = words.slice(0, -1)
    expect(whole.every(word => /^[a-z]{4,6}$/u.test(word))).toBe(true)
    expect(new Set(whole).size).toBe(24)
    expect(generatedText(2, 1)).toBe('.')
  })

  it('answers a step with generated text of the size it names, after the reasoning it names', () => {
    const script = parseModelScript(
      JSON.stringify({
        steps: [
          {
            when: { has: ['long'] },
            text: { seed: 5, bytes: 2000 },
            reasoning: { seed: 6, bytes: 3000 },
          },
          {
            when: { has: ['think'] },
            call: [{ id: 'call_a', tool: 'Files', arguments: {} }],
            reasoning: { seed: 7, bytes: 100 },
          },
        ],
      }),
    )
    const said = frames(scriptedAnswer(script, asked(chat('long'))).body) as {
      choices: {
        delta: { content?: string; reasoning_details?: { data: string; type: string }[] }
      }[]
    }[]
    expect(said[0]?.choices[0]?.delta.reasoning_details).toEqual([
      {
        type: 'reasoning.encrypted',
        id: 'rs_lab_6',
        index: 0,
        format: 'openai-responses-v1',
        data: generatedText(6, 3000),
      },
    ])
    expect(said[1]?.choices[0]?.delta.content).toBe(generatedText(5, 2000))
    const called = frames(scriptedAnswer(script, asked(chat('think'))).body) as {
      choices: { delta: Record<string, unknown>; finish_reason?: string }[]
    }[]
    expect(Object.keys(called[0]?.choices[0]?.delta ?? {})).toEqual(['reasoning_details'])
    expect(Object.keys(called[1]?.choices[0]?.delta ?? {})).toEqual(['tool_calls'])
    expect(called[2]?.choices[0]?.finish_reason).toBe('tool_calls')
  })

  it('says which step answers a request: the first that fits, none for a judging or when nothing fits', () => {
    expect(fittingStep(SCRIPT, asked(chat('请整理待办')))).toBe(0)
    expect(fittingStep(SCRIPT, asked(chat('请整理待办', 'call_list')))).toBe(1)
    expect(fittingStep(SCRIPT, asked(chat('别的')))).toBe(2)
    const none = parseModelScript('{"steps":[{"when":{"has":["x"]},"say":"a"}]}')
    expect(fittingStep(none, asked(chat('别的')))).toBeNull()
    expect(fittingStep(SCRIPT, asked(JSON.stringify({ questions: {} })))).toBeNull()
  })

  it('refuses a step that both says and generates, or names text of no size', () => {
    const step = (given: object) => JSON.stringify({ steps: [{ when: {}, ...given }] })
    expect(() => parseModelScript(step({ say: 'a', text: { seed: 1, bytes: 10 } }))).toThrow(
      /one of the three/u,
    )
    expect(() => parseModelScript(step({ text: { seed: 1, bytes: 0 } }))).toThrow(/model script/u)
    expect(() => parseModelScript(step({ call: [] }))).toThrow(/model script/u)
    expect(() => parseModelScript(step({ reasoning: { seed: 1, bytes: 10 } }))).toThrow(
      /one of the three/u,
    )
  })
})

describe('a model script of the lab assembly', () => {
  it('names the provider the model of the request is served by: a model record refuses an answer of another provider', () => {
    const haiku = JSON.stringify({
      model: 'anthropic/claude-haiku-5.5',
      messages: [{ role: 'user', content: '你好' }],
    })
    expect(frames(scriptedAnswer(SCRIPT, asked(haiku)).body)[0]).toMatchObject({
      model: 'anthropic/claude-haiku-5.5',
      provider: 'Anthropic',
    })
  })

  it('answers a request with the first step whose words are all in it and whose barred words are not', () => {
    const first = scriptedAnswer(SCRIPT, asked(chat('请整理待办')))
    expect(first).toMatchObject({ status: 200, contentType: 'text/event-stream' })
    expect(frames(first.body)).toEqual([
      {
        model: 'openai/m',
        provider: 'OpenAI',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_list',
                  type: 'function',
                  function: { name: 'Files', arguments: '{"command":"list","params":{}}' },
                },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
    const second = scriptedAnswer(SCRIPT, asked(chat('请整理待办', 'call_list 的结果')))
    expect(frames(second.body)).toEqual([
      { model: 'openai/m', provider: 'OpenAI', choices: [{ delta: { content: '整理好了。' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
    expect(second.body.endsWith('data: [DONE]\n\n')).toBe(true)
    expect(frames(scriptedAnswer(SCRIPT, asked(chat('你好'))).body)[0]).toMatchObject({
      choices: [{ delta: { content: '我在。' } }],
    })
  })

  it('says so in the reply when no step fits, so a journey reads why the agent did nothing', () => {
    const none = parseModelScript(JSON.stringify({ steps: [{ when: { has: ['x'] }, say: 'y' }] }))
    expect(frames(scriptedAnswer(none, asked(chat('你好'))).body)[0]).toMatchObject({
      choices: [{ delta: { content: 'model script: no step fits this request' } }],
    })
  })

  it('answers a judging by its first fitting rule: every criterion, every rule and every exit of the request', () => {
    const judging = (state: string) =>
      JSON.stringify({
        model: 'openai/judge',
        state,
        questions: {
          A1: { type: 'choice', criteria: { holds: '', fails: '', 'no-evidence': '' } },
          N1: { type: 'choice', criteria: { kept: '', broken: '', unclear: '' } },
          A2: { type: 'noul' },
          X1: { type: 'noul' },
          U1: { type: 'choice', criteria: { none: '', blocked: '' } },
        },
      })
    const settled = scriptedAnswer(SCRIPT, asked(judging('做完了')))
    expect(settled).toMatchObject({ status: 200, contentType: 'application/json' })
    expect(JSON.parse(settled.body)).toEqual({
      model: 'openai/judge',
      provider: 'OpenAI',
      answers: {
        A1: { type: 'choice', choice: 'holds', probabilities: { holds: 0.97 } },
        A2: { type: 'noul', noul: 0.97 },
        N1: { type: 'choice', choice: 'kept', probabilities: { kept: 0.97 } },
        X1: { type: 'noul', noul: 0.02 },
        U1: { type: 'choice', choice: 'none', probabilities: { none: 0.97 } },
      },
      usage: { input_tokens: 120, output_tokens: 8, cost: 0 },
    })
    const open = JSON.parse(scriptedAnswer(SCRIPT, asked(judging('还没做完'))).body) as {
      answers: Record<string, { choice?: string; noul?: number }>
    }
    expect([
      open.answers['A1']?.choice,
      open.answers['A2']?.noul,
      open.answers['N1']?.choice,
      open.answers['X1']?.noul,
    ]).toEqual(['no-evidence', 0.030000000000000027, 'kept', 0.01])
  })

  it('answers nothing to a judging no rule fits: the judge is then unavailable, not wrong', () => {
    const bare = parseModelScript(JSON.stringify({ steps: [] }))
    const body = JSON.stringify({ model: 'm', state: {}, questions: { A1: { type: 'noul' } } })
    expect(
      (JSON.parse(scriptedAnswer(bare, asked(body)).body) as { answers: unknown }).answers,
    ).toEqual({})
  })

  it.each([
    ['not JSON', '{'],
    ['no steps', '{}'],
    ['a step that neither says nor calls', '{"steps":[{"when":{}}]}'],
    ['a step that both says and calls', '{"steps":[{"when":{},"say":"a","call":[]}]}'],
    ['a member it does not know', '{"steps":[],"extra":1}'],
  ])('refuses a script that is %s, naming what is wrong', (_, text) => {
    expect(() => parseModelScript(text)).toThrow(/model script/u)
  })

  it('says where a script is wrong and what a step may be', () => {
    expect(() => parseModelScript('{"steps":[{"when":{},"say":"a"},{"when":{}}]}')).toThrow(
      /a step says a sentence \(say\), says generated text \(text\) or calls tools \(call\), one of the three[\s\S]*steps\[1\]/u,
    )
  })
})

describe('the operator layer with the model route of the lab gateway', () => {
  const located = resolveLocations({
    platform: 'linux',
    env: { OMNE_SERVER_HOME: '/h' },
    home: '/u',
  })
  if (located.kind !== 'located') throw new Error('fixture')
  const local = localOperatorLayer({
    platform: 'linux',
    distribution: JSON.parse(readFileSync(distributionPath, 'utf8')) as unknown,
    shutdownDeadlineMs: 5000,
    locations: located.locations,
    settings: {
      version: 1,
      port: 8965,
      workspace: '/work',
      shell: '/bin/bash',
      shellEnvironment: captureShellEnvironment('linux', { PATH: '/usr/bin', HOME: '/u' }),
    },
  })
  const sendingOf = (layer: typeof local) =>
    layer.ops.find(op => op.id === 'model-records')?.config as {
      sendStage: { endpoints: unknown; network: unknown }
    }

  it('points every endpoint of the release provider at the gateway, in the layer the local server really builds, and leaves the rest as it was', () => {
    const url = 'https://127.0.0.1:9/api/v1/chat/completions'
    const routed = withModelRoute(local, url)
    expect(sendingOf(local).sendStage.endpoints).toEqual({})
    expect(sendingOf(routed).sendStage.endpoints).toEqual({ openrouter: url })
    expect(sendingOf(routed).sendStage.network).toEqual(sendingOf(local).sendStage.network)
    const others = (layer: typeof local) => layer.ops.filter(op => op.id !== 'model-records')
    expect(others(routed)).toEqual(others(local))
    const { sendStage: _was, ...rest } = sendingOf(local) as Record<string, unknown>
    const { sendStage: _now, ...kept } = sendingOf(routed) as Record<string, unknown>
    expect(kept).toEqual(rest)
  })

  it('replaces the share of the window at which a compaction is due in the two rows that hold it, and nothing else of the layer', () => {
    const profilesOf = (layer: typeof local) =>
      (sendingOf(layer).sendStage as unknown as { profiles: Record<string, unknown> }).profiles
    const rowOf = (layer: typeof local) =>
      layer.ops.find(op => op.id === 'model-profiles')?.config as Record<string, unknown>
    const lowered = withCompactionTrigger(local, '3')
    expect(profilesOf(local)['compactionTriggerPercent']).toBe('80')
    expect(profilesOf(lowered)).toEqual({ ...profilesOf(local), compactionTriggerPercent: '3' })
    expect(rowOf(lowered)).toEqual({ ...rowOf(local), compactionTriggerPercent: '3' })
    expect(sendingOf(lowered).sendStage.network).toEqual(sendingOf(local).sendStage.network)
    const others = (layer: typeof local) =>
      layer.ops.filter(op => op.id !== 'model-records' && op.id !== 'model-profiles')
    expect(others(lowered)).toEqual(others(local))
    for (const percent of ['0', '101', '2.5', 'half', '', '05', '1000', ' 5', '5 ', '5x', 'x5'])
      expect(() => withCompactionTrigger(local, percent)).toThrow(
        `compaction trigger: ${percent} is not a whole percent from 1 to 100`,
      )
    for (const percent of ['1', '9', '10', '99', '100'])
      expect(profilesOf(withCompactionTrigger(local, percent))['compactionTriggerPercent']).toBe(
        percent,
      )
    expect(() => withCompactionTrigger({ ops: [] }, '3')).toThrow(
      'compaction trigger: the operator layer has no send stage in model-records',
    )
    const lone = { ops: local.ops.filter(op => op.id !== 'model-profiles') }
    expect(() => withCompactionTrigger(lone, '3')).toThrow(/model-profiles/u)
  })

  it('refuses a layer without the row that sends, or without its send stage: the script would never be asked', () => {
    const without = { ops: local.ops.filter(op => op.id !== 'model-records') }
    expect(() => withModelRoute(without, 'https://x')).toThrow(
      'model script: the operator layer has no send stage in model-records',
    )
    const bare = {
      ops: [{ kind: 'replace' as const, id: 'model-records', config: { owners: [] } }],
    }
    expect(() => withModelRoute(bare, 'https://x')).toThrow(/send stage/u)
  })
})
