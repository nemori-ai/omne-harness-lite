import { describe, expect, it } from 'vitest'
import { judgeToolReturn } from '@omne-harness-lite/tool-definition'

const rawCall = {
  id: 'b_raw',
  kind: 'tool_call',
  complete: true,
  callId: 'call_raw',
  tool: 'bad:name',
  rawArguments: '{"n":9007199254740993}',
  unparseable: true,
  visibility: { toHuman: true, toModel: true },
}
const parsedCall = {
  id: 'b_parsed',
  kind: 'tool_call',
  complete: true,
  callId: 'call_parsed',
  tool: 'bad:name',
  arguments: {},
  visibility: { toHuman: true, toModel: true },
}

describe('D068 S26 complete CB admission still precedes result prohibition and M17/M18', () => {
  for (const position of ['content', 'summary'] as const) {
    it.each([
      [rawCall, parsedCall],
      [parsedCall, rawCall],
    ])(`${position}: a valid unparsed call cannot hide another malformed block`, (...blocks) => {
      const input =
        position === 'content'
          ? { content: blocks }
          : {
              content: [],
              offload: { raw: { inline: 'eA==', mediaType: 'text/plain' }, summary: blocks },
            }
      expect(judgeToolReturn(input)).toEqual({ rejected: 'malformed' })
    })
    it(`${position}: represented call rejection precedes missing raw or extra return members`, () => {
      const input =
        position === 'content'
          ? { content: [rawCall], extra: true }
          : { content: [], offload: { summary: [rawCall] } }
      expect(judgeToolReturn(input)).toEqual({ rejected: 'result_call_in_content' })
    })
  }
})
