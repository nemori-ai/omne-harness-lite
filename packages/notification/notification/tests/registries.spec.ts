import { describe, expect, it } from 'vitest'
import { createSourceRegistry, NotificationRegistrationError } from '@omne-harness/notification'
import { declaration, declared, source } from './world.ts'

describe('the source registry', () => {
  it('registers, looks up, lists and undoes a registration', () => {
    const changes: number[] = []
    const registry = createSourceRegistry(() => changes.push(1))
    expect(registry.lookup(source)).toEqual({ kind: 'absent' })
    const undo = registry.register(declaration())
    expect(registry.lookup(source)).toEqual({ kind: 'registered', declaration: declaration() })
    expect(registry.list()).toHaveLength(1)
    undo()
    undo()
    expect(registry.lookup(source)).toEqual({ kind: 'absent' })
    expect(changes).toHaveLength(2)
  })

  it('fails on a second registration of the same name and keeps the first', () => {
    const registry = createSourceRegistry()
    const first = declaration()
    registry.register(first)
    expect(() => registry.register(declaration(declared({ label: 'Other' })))).toThrow(
      NotificationRegistrationError,
    )
    expect(registry.lookup(source)).toEqual({ kind: 'registered', declaration: first })
  })

  it('does not let the undo of a replaced registration remove its successor', () => {
    const registry = createSourceRegistry()
    const undoFirst = registry.register(declaration())
    undoFirst()
    registry.register(declaration())
    undoFirst()
    expect(registry.lookup(source).kind).toBe('registered')
  })

  it.each([
    ['an invalid source name', { ...declaration(), name: 'Demo' as never }],
    ['a repeated event type', declaration(declared(), declared())],
    ['an invalid event type name', declaration(declared({ name: 'Bad Name' as never }))],
  ])('refuses %s', (_case, bad) => {
    expect(() => createSourceRegistry().register(bad)).toThrow(NotificationRegistrationError)
  })
})
