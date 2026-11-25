import { describe, expect, it } from 'vitest'
import { actOf, shortcutOf } from '../src/view/keys.ts'

type Press = Partial<
  Readonly<{
    key: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    defaultPrevented: boolean
  }>
>
const press = (over: Press, field = false) =>
  ({
    key: 'g',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    defaultPrevented: false,
    target: { closest: () => (field ? {} : null) },
    ...over,
  }) as unknown as React.KeyboardEvent

describe('the keys of the sheet', () => {
  it('says each key of an act as aria-keyshortcuts writes it', () => {
    expect(shortcutOf('take')).toBe('Delete Backspace')
    expect(shortcutOf('pile')).toBe('G')
    expect(shortcutOf('select')).toBe(' ')
  })

  it('reads a letter in either case as its act', () => {
    expect(actOf(press({ key: 'g' }))).toBe('pile')
    expect(actOf(press({ key: 'G' }))).toBe('pile')
    expect(actOf(press({ key: 'Backspace' }))).toBe('take')
  })

  it('reads no act from a press with a modifier, one already handled, or one typed into a field', () => {
    expect(actOf(press({ metaKey: true }))).toBeUndefined()
    expect(actOf(press({ ctrlKey: true }))).toBeUndefined()
    expect(actOf(press({ altKey: true }))).toBeUndefined()
    expect(actOf(press({ defaultPrevented: true }))).toBeUndefined()
    expect(actOf(press({}, true))).toBeUndefined()
  })

  it('leaves the space to the paper: selecting is not read here', () => {
    expect(actOf(press({ key: ' ' }))).toBeUndefined()
  })
})
