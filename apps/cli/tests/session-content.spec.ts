import { expect, it } from 'vitest'
import { unwrap, parseTenantId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createSessionPresentation } from '../src/session-presentation.ts'
import { presentationLines } from '../src/session-presentation-output.ts'
import { terminalMessageLines } from '../src/session-terminal-output.ts'

const id = (value: string) => unwrap(parseOpaqueIdentifier(value, 'BlockId'))
const call = unwrap(parseOpaqueIdentifier('call-one', 'CallId'))
const scope = {
  tenant: unwrap(parseTenantId({ organization: 'org', account: 'owner' })),
  session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
}
const visibility = { toHuman: true, toModel: true }
it('retains tool arguments in cumulative model content and its original text/call/text position', async () => {
  const store = createSessionPresentation({
    maxCalls: 4,
    maxBlocks: 20,
    maxCharactersPerCall: 10000,
  })
  store.bindModel(scope, 'run', 'model')
  store.model(
    { ...scope, callId: 'model', dispatch: 0 },
    {
      position: 1,
      blocks: [
        {
          index: 0,
          closed: true,
          block: { id: id('before'), kind: 'text', visibility, text: 'before call' },
        },
        {
          index: 1,
          closed: true,
          block: {
            id: id('call-block'),
            kind: 'tool_call',
            complete: true,
            visibility,
            callId: call,
            tool: 'Shell',
            arguments: { command: 'printf content-marker' },
          },
        },
        {
          index: 2,
          closed: true,
          block: { id: id('after'), kind: 'text', visibility, text: 'after call' },
        },
      ],
    },
  )
  const lines = presentationLines(await store.read(scope, 'run')).join('\n')
  expect(lines).toContain('printf content-marker')
  expect(lines.indexOf('before call')).toBeLessThan(lines.indexOf('Shell'))
  expect(lines.indexOf('Shell')).toBeLessThan(lines.indexOf('after call'))
})
it('does not print an empty reasoning heading', () => {
  expect(
    terminalMessageLines({
      position: 1,
      run: 'run',
      id: 'message',
      type: 'assistant',
      createdAt: '2026-10-10T00:00:00Z',
      blocks: [{ id: 'empty', kind: 'thinking', text: '' }],
    }),
  ).toEqual([])
})

