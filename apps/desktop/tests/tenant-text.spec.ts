import { describe, expect, it } from 'vitest'
import { LOOK_KEY, storedTenantTexts } from '../src/page/shell/tenant-text.ts'

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'

function memory() {
  const held = new Map<string, string>()
  const store = {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  }
  return { store, held }
}

describe('按租户记在本机的一段文字', () => {
  it('按租户各记各的，写了就原样读得回；键是前缀接租户', () => {
    const { store, held } = memory()
    const texts = storedTenantTexts(() => store, LOOK_KEY)
    expect(texts.read(ALICE)).toBeNull()
    texts.write(ALICE, '{"kind":"named","name":"sea"}')
    expect(texts.read(ALICE)).toBe('{"kind":"named","name":"sea"}')
    expect(texts.read(BOB)).toBeNull()
    expect([...held.keys()]).toEqual([`omne.look.${ALICE}`])
  })

  it('存储读写抛出时，读答没有，写不抛', () => {
    const texts = storedTenantTexts(() => {
      throw new Error('no storage')
    }, LOOK_KEY)
    expect(texts.read(ALICE)).toBeNull()
    expect(() => texts.write(ALICE, 'x')).not.toThrow()
  })
})
