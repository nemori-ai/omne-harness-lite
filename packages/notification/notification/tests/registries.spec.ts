import { describe, expect, it } from 'vitest'
import {
  createChannelRegistry,
  createSourceRegistry,
  NotificationRegistrationError,
} from '@omne-harness/notification'
import { fakeChannel } from '@omne-harness/notification/testing'
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

describe('a registration that fails says what is wrong', () => {
  const failure = (run: () => unknown): Error => {
    try {
      run()
    } catch (error) {
      return error as Error
    }
    throw new Error('expected the registration to fail')
  }

  it('for a source: its name, a repeated or invalid event type, a name that is taken', () => {
    const registry = createSourceRegistry()
    const badName = failure(() =>
      registry.register({ ...declaration(), name: 'Bad Name' as never }),
    )
    expect([badName.name, badName.message]).toEqual([
      'NotificationRegistrationError',
      'invalid source name: Bad Name',
    ])
    const twice = failure(() => registry.register(declaration(declared(), declared())))
    expect(twice.message).toBe('invalid or repeated event type in demo.things: changed')
    const badType = failure(() =>
      registry.register(declaration(declared({ name: 'Bad Type' as never }))),
    )
    expect(badType.message).toBe('invalid or repeated event type in demo.things: Bad Type')
    registry.register(declaration())
    expect(failure(() => registry.register(declaration())).message).toBe(
      'source already registered: demo.things',
    )
  })

  it('for a channel: its name, a name that is taken', () => {
    const registry = createChannelRegistry()
    const mail = fakeChannel('mail')
    const badName = failure(() => registry.register({ ...mail, name: 'Bad Name' as never }))
    expect([badName.name, badName.message]).toEqual([
      'NotificationRegistrationError',
      'invalid channel name: Bad Name',
    ])
    registry.register(mail)
    expect(failure(() => registry.register(fakeChannel('mail'))).message).toBe(
      'channel already registered: mail',
    )
  })
})
