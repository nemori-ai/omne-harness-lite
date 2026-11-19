// @module-tag slow
import { expect, it } from 'vitest'
import { onReleaseTree, pollUntil, historyOf } from '../support/release-tree.ts'

const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const STEPS = 3

type Body = Readonly<{ messages: readonly unknown[] } & Record<string, unknown>>

// Every member but the message list must stay the same: the system prompt is the first message,
// the tool declarations are `tools`.
function rest(body: Body): string {
  const { messages: _messages, ...others } = body
  return JSON.stringify(others)
}

it('a later request of a tool loop starts with the whole earlier request', async () => {
  const bodies: Body[] = []
  await onReleaseTree(
    {
      permission: 'bypass-permissions',
      collaboration: 'co-work',
      script: ({ body }) => {
        const request = JSON.parse(body) as Body & { model: string }
        bodies.push(request)
        const serving = { model: request.model, provider: 'OpenAI' }
        const step = bodies.length
        const events: unknown[] =
          step <= STEPS
            ? [
                { ...serving, choices: [{ delta: { content: `step ${step}` } }] },
                {
                  ...serving,
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: `call_${step}`,
                            type: 'function',
                            function: {
                              name: 'Ask',
                              arguments: JSON.stringify({ command: 'no-such-command', params: {} }),
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
                { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
              ]
            : [
                { ...serving, choices: [{ delta: { content: 'done' } }] },
                { choices: [{ delta: {}, finish_reason: 'stop' }] },
              ]
        return { status: 200, contentType: 'text/event-stream', body: sse(events) }
      },
    },
    async world => {
      const session = await world.startSession('Run the loop and finish.')
      await pollUntil(
        'the tool loop ends',
        () => historyOf(world, session),
        seen => seen.some(entry => entry.kind === 'run.terminal'),
      )
    },
  )
  expect(bodies).toHaveLength(STEPS + 1)
  for (let at = 1; at < bodies.length; at++) {
    const earlier = bodies[at - 1] as Body
    const later = bodies[at] as Body
    expect(rest(later), `request ${at + 1}: members besides messages`).toBe(rest(earlier))
    expect(later.messages.length).toBeGreaterThan(earlier.messages.length)
    expect(
      JSON.stringify(later.messages.slice(0, earlier.messages.length)),
      `request ${at + 1} starts with request ${at}`,
    ).toBe(JSON.stringify(earlier.messages))
  }
})
