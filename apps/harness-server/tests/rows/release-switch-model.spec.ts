// @module-tag slow
import { expect, it } from 'vitest'
import { interfacePath } from '../fixtures/gateway-wire.ts'
import { historyOf, onReleaseTree, pollUntil, type Entry } from '../support/release-tree.ts'

const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const OPENAI = 'openai/gpt-6.1-sol'
const SIGNED = 'SIGNATURE-OF-THE-CLAUDE-THINKING'

type Body = Readonly<{ model: string; messages: readonly Readonly<Record<string, unknown>>[] }>
type Sent = Readonly<{ body: Body; raw: string; spoken: string }>

const terminals = (entries: readonly Entry[]) =>
  entries.filter(entry => entry.kind === 'run.terminal').length

// Sonnet 5 binds its reasoning to nothing, Opus 5.5 to the prefix it was made on.
it.each(['anthropic/claude-sonnet-5', 'anthropic/claude-opus-5.5'])(
  'C19: a session on %s switches to OpenAI and back; the switch-out leaves the thinking behind, the switch-back carries it, and the history only grows',
  async CLAUDE => {
    const sent: Sent[] = []
    const reads: (readonly Entry[])[] = []
    await onReleaseTree(
      {
        permission: 'bypass-permissions',
        collaboration: 'co-work',
        model: CLAUDE,
        script: ({ body, rawBody, path }) => {
          const request = JSON.parse(body) as Body
          sent.push({ body: request, raw: rawBody, spoken: interfacePath(path, rawBody) })
          const claude = request.model.startsWith('anthropic/')
          const serving = { model: request.model, provider: claude ? 'Anthropic' : 'OpenAI' }
          const thinking = claude
            ? [
                {
                  ...serving,
                  choices: [
                    {
                      delta: {
                        reasoning_details: [
                          { type: 'reasoning.encrypted', id: 'th', index: 0, data: SIGNED },
                        ],
                      },
                    },
                  ],
                },
              ]
            : []
          const events = [
            ...thinking,
            { ...serving, choices: [{ delta: { content: `answer ${String(sent.length)}` } }] },
            {
              choices: [{ delta: {}, finish_reason: 'stop' }],
              usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 },
            },
          ]
          return { status: 200, contentType: 'text/event-stream', body: sse(events) }
        },
      },
      async tree => {
        const turn = async (count: number) => {
          const entries = await pollUntil(
            `run ${String(count)} ends`,
            () => historyOf(tree, session),
            seen => terminals(seen) >= count,
          )
          reads.push(entries)
        }
        const select = async (model: string) => {
          const answer = await tree.cli(['select-model', '--session', session, '--model', model])
          expect(answer.status, `${answer.stdout}\n${answer.stderr}`).toBe(0)
          expect(JSON.parse(answer.stdout)).toMatchObject({ outcome: 'succeeded' })
        }
        const send = async (text: string) => {
          const answer = await tree.cli(['send-input', '--session', session, '--text', text])
          expect(answer.status, answer.stderr).toBe(0)
        }
        const session = await tree.startSession('first: think on Claude')
        await turn(1)
        await select(OPENAI)
        await send('second: answer on OpenAI')
        await turn(2)
        await select(CLAUDE)
        await send('third: back on Claude')
        await turn(3)
      },
    )
    expect(sent.map(item => [item.spoken, item.body.model])).toEqual([
      ['/api/v1/messages', CLAUDE],
      ['/api/v1/responses', OPENAI],
      ['/api/v1/messages', CLAUDE],
    ])
    const [, out, back] = sent as [Sent, Sent, Sent]
    expect(out.raw).not.toContain(SIGNED)
    const first = back.body.messages.find(message => message['role'] === 'assistant')
    expect(JSON.stringify(first ?? null)).toContain(SIGNED)
    for (const [earlier, later] of [
      [reads[0], reads[1]],
      [reads[1], reads[2]],
    ] as const)
      expect(later?.slice(0, earlier?.length ?? 0)).toEqual(earlier)
  },
)
