import { expect, it } from 'vitest'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { isReadable, judgeCompactionList } from '@omne-harness-lite/messages'
import { assistant, at, compact, logged, ref } from './helpers.ts'
const initialSeed = 20260926
interface Fact {
  readonly id: string
  readonly ancestors: readonly string[]
  readonly flags: readonly boolean[]
}
for (let offset = 0; offset < 64; offset++) {
  const seed = initialSeed + offset
  it(`V5 original-tree hand oracle seed ${seed}`, () => {
    let state = seed
    function random() {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      return state >>> 0
    }
    const facts: Fact[] = []
    let counter = 0
    function identity(ancestors: readonly string[], flags: readonly boolean[]) {
      const id = `b${counter++}`,
        visible = (random() & 1) === 1
      facts.push({ id, ancestors: [...ancestors, id], flags: [...flags, visible] })
      return { id, visible, path: [...ancestors, id], pathFlags: [...flags, visible] }
    }
    function leaf(ancestors: readonly string[], flags: readonly boolean[]): JsonObject {
      const own = identity(ancestors, flags)
      return {
        id: own.id,
        kind: 'text',
        visibility: { toHuman: true, toModel: own.visible },
        text: 'payload',
      }
    }
    function media(ancestors: readonly string[], flags: readonly boolean[]): JsonObject {
      const own = identity(ancestors, flags)
      return {
        id: own.id,
        kind: 'image',
        visibility: { toHuman: true, toModel: own.visible },
        mediaType: 'image/png',
        data: { inline: 'eA==' },
        renderings: [{ producedBy: 'system', blocks: [leaf(own.path, own.pathFlags)] }],
        transcript: 'payload',
      }
    }
    function result(
      depth: number,
      ancestors: readonly string[],
      flags: readonly boolean[],
    ): JsonObject {
      const own = identity(ancestors, flags),
        children = [leaf(own.path, own.pathFlags), media(own.path, own.pathFlags)]
      if (depth < 2) children.push(result(depth + 1, own.path, own.pathFlags))
      return {
        id: own.id,
        kind: 'tool_result',
        visibility: { toHuman: true, toModel: own.visible },
        callId: 'call',
        outcome: 'completed',
        blocks: children,
      }
    }
    const root = result(0, [], [])
    const call = logged(assistant('call'))
    const message = logged({ id: 'm', type: 'tool', callId: 'call', blocks: [root], createdAt: at })
    const named = facts.filter(() => random() % 3 === 0).map(item => item.id)
    const c = compact(
      'c',
      named.map(blockId => ({ messageId: 'm', blockId })),
    )
    const prefix = [call, message, c],
      before = writeJsonLossless(prefix)
    expect(
      judgeCompactionList(c, [call, message], {
        pendingCardBlocks: [],
        lastModelRequestPrefixLength: 2,
      }),
    ).toEqual({ valid: true })
    for (const fact of facts) {
      const expected = fact.flags.every(Boolean) && !fact.ancestors.some(id => named.includes(id))
      expect(isReadable(ref('m', fact.id), prefix), `seed ${seed} block ${fact.id}`).toBe(expected)
    }
    expect(writeJsonLossless(prefix)).toBe(before)
  })
}
