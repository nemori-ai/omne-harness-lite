import { Context } from '@deepseek-ai/cordis'
import { serviceKey } from '@omne-harness/shell-contract'
import { describe, expect, it } from 'vitest'
import { handOver, type Holder } from '../src/page/hand-over.ts'

type Need = Readonly<{ label: string }>
type Given = Readonly<{ label: string; extra: number }>

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const holderKey = serviceKey<Holder<Need>>('test.holder')
const sourceKey = serviceKey<Given>('test.source')

function holder() {
  const held: Need[] = []
  const place: Holder<Need> = {
    attach(given) {
      held.push(given)
      return () => void held.splice(held.indexOf(given), 1)
    },
  }
  return { held, place }
}

describe('handing a service of one interface module to a place another opened', () => {
  it('hands it over once both are on the tree, whichever comes first', async () => {
    for (const first of ['holder', 'source'] as const) {
      const root = new Context()
      const { held, place } = holder()
      await root.plugin(handOver(holderKey, sourceKey))
      const given = { label: 'models', extra: 1 }
      if (first === 'holder') root.reflect.provide(holderKey, place)
      else root.reflect.provide(sourceKey, given)
      await settle()
      expect(held).toEqual([])
      if (first === 'holder') root.reflect.provide(sourceKey, given)
      else root.reflect.provide(holderKey, place)
      await settle()
      expect(held).toEqual([given])
    }
  })

  it('takes it back when the source leaves, and hands it over again when it returns', async () => {
    const root = new Context()
    const { held, place } = holder()
    root.reflect.provide(holderKey, place)
    await root.plugin(handOver(holderKey, sourceKey))
    const withdraw = root.reflect.provide(sourceKey, { label: 'first', extra: 1 })
    await settle()
    expect(held.map(given => given.label)).toEqual(['first'])
    withdraw()
    await settle()
    expect(held).toEqual([])
    root.reflect.provide(sourceKey, { label: 'second', extra: 2 })
    await settle()
    expect(held.map(given => given.label)).toEqual(['second'])
  })

  it('takes it back when the holder leaves', async () => {
    const root = new Context()
    const { held, place } = holder()
    const withdraw = root.reflect.provide(holderKey, place)
    root.reflect.provide(sourceKey, { label: 'models', extra: 1 })
    await root.plugin(handOver(holderKey, sourceKey))
    await settle()
    expect(held).toHaveLength(1)
    withdraw()
    await settle()
    expect(held).toEqual([])
  })
})
