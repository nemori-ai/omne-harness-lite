import { describe, expect, it } from 'vitest'
import { owesWork, waitsForPerson, type CallWork } from '../src/call-dormancy.ts'

type Wait = Readonly<{ phase: string; id: string }>

const view = (
  state: Readonly<{ phase: string; wait?: Readonly<{ kind: string; wait: string }> }>,
  waits: readonly Wait[] = [],
  tasks: readonly string[] = [],
): CallWork =>
  ({
    state,
    waits: waits.map(wait => ({ phase: wait.phase, intent: { wait: wait.id } })),
    tasks: tasks.map(state => ({ state })),
  }) as unknown as CallWork

const askOn = (wait: string) => ({ phase: 'suspended', wait: { kind: 'ask', wait } })
const resourceOn = (wait: string) => ({ phase: 'suspended', wait: { kind: 'resource', wait } })
const running = { phase: 'running' }

describe('whether a run would do work of the call', () => {
  it.each([
    ['a pending task of a running call', view(running, [], ['pending']), true],
    ['a pending task after a resolved one', view(running, [], ['resolved', 'pending']), true],
    ['only resolved tasks', view(running, [], ['resolved', 'resolved']), false],
    ['no task and no wait', view(running), false],
    [
      'a suspended call whose wait is opening',
      view(askOn('w'), [{ phase: 'opening', id: 'w' }]),
      true,
    ],
    ['a suspended call whose wait is open', view(askOn('w'), [{ phase: 'open', id: 'w' }]), true],
    [
      'a suspended call whose wait is responding',
      view(askOn('w'), [{ phase: 'responding', id: 'w' }]),
      true,
    ],
    [
      'a suspended call with a closed wait before the live one',
      view(askOn('w2'), [
        { phase: 'closed', id: 'w1' },
        { phase: 'open', id: 'w2' },
      ]),
      true,
    ],
    [
      'a suspended call whose waits are all closed',
      view(askOn('w'), [{ phase: 'closed', id: 'w' }]),
      false,
    ],
    ['a suspended call with no wait record', view(askOn('w')), false],
    [
      'a live wait of a call that is not suspended',
      view(running, [{ phase: 'open', id: 'w' }]),
      false,
    ],
  ])('%s', (_name, work, expected) => {
    expect(owesWork(work)).toBe(expected)
  })
})

describe('whether only a person can move the call', () => {
  it.each([
    [
      'suspended on an Ask wait that is open, nothing pending',
      view(askOn('w'), [{ phase: 'open', id: 'w' }]),
      true,
    ],
    [
      'the open Ask wait comes after a closed one',
      view(askOn('w2'), [
        { phase: 'closed', id: 'w1' },
        { phase: 'open', id: 'w2' },
      ]),
      true,
    ],
    [
      'resolved tasks do not hold it',
      view(askOn('w'), [{ phase: 'open', id: 'w' }], ['resolved']),
      true,
    ],
    ['a call that is not suspended', view(running, [{ phase: 'open', id: 'w' }]), false],
    ['suspended on a resource wait', view(resourceOn('w'), [{ phase: 'open', id: 'w' }]), false],
    [
      'a pending task',
      view(askOn('w'), [{ phase: 'open', id: 'w' }], ['resolved', 'pending']),
      false,
    ],
    ['the Ask wait is still opening', view(askOn('w'), [{ phase: 'opening', id: 'w' }]), false],
    ['the Ask wait is responding', view(askOn('w'), [{ phase: 'responding', id: 'w' }]), false],
    ['the Ask wait is closed', view(askOn('w'), [{ phase: 'closed', id: 'w' }]), false],
    ['the open wait is another wait', view(askOn('w'), [{ phase: 'open', id: 'other' }]), false],
    [
      'the asked wait is not open while another is',
      view(askOn('w'), [
        { phase: 'responding', id: 'w' },
        { phase: 'open', id: 'other' },
      ]),
      false,
    ],
    ['no wait record', view(askOn('w')), false],
  ])('%s', (_name, work, expected) => {
    expect(waitsForPerson(work)).toBe(expected)
  })
})
