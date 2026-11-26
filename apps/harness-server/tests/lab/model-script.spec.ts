import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveLocations } from '../../src/local/locations.ts'
import { localOperatorLayer } from '../../src/local/operator-defaults.ts'
import { captureShellEnvironment } from '../../src/local/settings.ts'
import {
  parseModelScript,
  scriptedAnswer,
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

describe('a model script of the lab assembly', () => {
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
      open.answers['N1']?.choice,
      open.answers['X1']?.noul,
    ]).toEqual(['no-evidence', 'kept', 0.01])
  })

  it('answers nothing to a judging no rule fits: the judge is then unavailable, not wrong', () => {
    const bare = parseModelScript(JSON.stringify({ steps: [] }))
    const body = JSON.stringify({ model: 'm', state: {}, questions: { A1: { type: 'noul' } } })
    expect(JSON.parse(scriptedAnswer(bare, asked(body)).body)).toMatchObject({ answers: {} })
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

  it('refuses a layer without the row that sends, or without its send stage: the script would never be asked', () => {
    const without = { ops: local.ops.filter(op => op.id !== 'model-records') }
    expect(() => withModelRoute(without, 'https://x')).toThrow(/model-records/u)
    const bare = {
      ops: [{ kind: 'replace' as const, id: 'model-records', config: { owners: [] } }],
    }
    expect(() => withModelRoute(bare, 'https://x')).toThrow(/send stage/u)
  })
})
