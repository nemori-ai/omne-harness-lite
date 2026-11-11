import { expect, it } from 'vitest'
import type { ToolBodyDeclaration } from '@omne-harness/tool-contract'
import { adoption } from '../coordinator-values.ts'
import { accepted, fixture, unbox } from './fixture.ts'

it('finishes the body writes an author left unawaited before it settles the call', async () => {
  const declaration: ToolBodyDeclaration = { kind: 'text', codec: adoption('text') }
  const pending: Promise<unknown>[] = []
  const world = await fixture(
    async (_value, _environment, context) => {
      unbox(await context.body.begin('spare', { kind: 'text', codec: declaration.codec }))
      pending.push(
        context.body.append('spare', '1', {
          kind: 'text',
          block: 'spare',
          text: 'not part of the answer',
          end: true,
        }),
      )
      pending.push(context.body.seal('spare', '1'))
      return 'done'
    },
    undefined,
    32,
    false,
    undefined,
    undefined,
    { declaration, schemas: undefined },
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('body-drain')))
    const result = await world.settled(reference)
    expect(result.terminal.kind).toBe('completed')
    expect(pending).toHaveLength(2)
    // The scope closes after the writes it accepted are done: neither is cut off.
    for (const write of pending) expect(await write).toHaveProperty('ok')
    expect(
      result.value.content.map(block => (block.kind === 'text' ? block.text : '')).join(''),
    ).toBe('done')
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})
