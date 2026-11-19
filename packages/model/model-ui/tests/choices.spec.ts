import { describe, expect, it } from 'vitest'
import { createModelChoices, noteOf } from '@omne-harness/model-ui'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

const model = (route: string, over: Record<string, unknown> = {}) => ({
  route,
  selectable: true,
  reasons: [],
  credential: 'available',
  input: ['text'],
  output: ['text'],
  ...over,
})

function choicesOver(answer: unknown) {
  const asked: unknown[] = []
  const client = {
    'list-models': async (body: unknown) => {
      asked.push(body)
      if (answer === 'throw') throw new Error('offline')
      return answer
    },
  }
  return { asked, choices: createModelChoices(client as never) }
}

describe('the word said of a model', () => {
  it.each([
    [{ selectable: true, reasons: [], credential: 'available' }, null],
    [{ selectable: true, reasons: [], credential: 'unknown' }, null],
    [{ selectable: true, reasons: [], credential: 'missing' }, '还没有配置凭据，选了也暂时调不了'],
    [{ selectable: false, reasons: ['modality'], credential: 'available' }, '不能选：不支持文字'],
    [
      { selectable: false, reasons: ['locked', 'scope'], credential: 'missing' },
      '不能选：被锁定、不在这个租户能用的范围里',
    ],
    [{ selectable: false, reasons: [], credential: 'available' }, '现在不能选'],
  ] as const)('%j is said as %j', (given, said) => {
    expect(noteOf(given as never)).toBe(said)
  })
})

describe('the list of models of a tenant', () => {
  it('asks Model for the tenant, and gives each model with whether it can be picked and a word on it', async () => {
    const { asked, choices } = choicesOver({
      outcome: 'succeeded',
      body: {
        models: [
          model('anthropic/claude-sonnet-5'),
          model('openai/gpt-6-sol', { credential: 'missing' }),
          model('locked', { selectable: false, reasons: ['locked'] }),
        ],
      },
    })
    expect(await choices.list(TENANT)).toEqual({
      kind: 'listed',
      choices: [
        { route: 'anthropic/claude-sonnet-5', selectable: true, note: null },
        { route: 'openai/gpt-6-sol', selectable: true, note: '还没有配置凭据，选了也暂时调不了' },
        { route: 'locked', selectable: false, note: '不能选：被锁定' },
      ],
    })
    expect(asked).toHaveLength(1)
    expect(JSON.stringify(asked[0])).toContain('org_00000000000000000000000000')
  })

  it('gives an empty list as an empty list', async () => {
    const { choices } = choicesOver({ outcome: 'succeeded', body: { models: [] } })
    expect(await choices.list(TENANT)).toEqual({ kind: 'listed', choices: [] })
  })

  it.each([
    [{ outcome: 'denied' }, '没有权限看模型的列表'],
    [{ outcome: 'basis-unavailable' }, '模型的列表暂时读不到'],
    [{ outcome: 'protocol-rejected' }, 'protocol-rejected'],
    ['throw', '没有送达'],
  ] as const)(
    'says a list that was not read is unavailable, never empty: %j',
    async (answer, reason) => {
      const { choices } = choicesOver(answer)
      expect(await choices.list(TENANT)).toEqual({ kind: 'unavailable', reason })
    },
  )

  it('does not ask for a tenant it cannot read', async () => {
    const { asked, choices } = choicesOver({ outcome: 'succeeded', body: { models: [] } })
    expect(await choices.list('not a tenant')).toEqual({
      kind: 'unavailable',
      reason: '租户读不懂',
    })
    expect(asked).toEqual([])
  })
})
