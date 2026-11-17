import { describe, expect, it } from 'vitest'
import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  enabledView,
  implementationOf,
  memberOfImplementation,
  membersAt,
  type ExtensionFacts,
} from '@omne-harness/loop-extension'

const declaration = (
  name: string,
  extra: Partial<LoopExtensionDeclaration> = {},
): LoopExtensionDeclaration => ({
  name,
  position: 'before_action',
  power: 'veto',
  implementation: { kind: 'builtin', builtinName: name },
  ...extra,
})

/** An extension that meets all four conditions; a test breaks one. */
const facts = (name: string, change: Partial<ExtensionFacts> = {}): ExtensionFacts => ({
  capability: name,
  assetRef: `asset/${name}`,
  holding: 'enabled',
  winner: { kind: 'version', version: 'v1', declaration: declaration(name) },
  run: { kind: 'value', value: true },
  ...change,
})

const basis = { assets: '7', settings: '3' }
const names = (view: ReturnType<typeof enabledView>) =>
  view.kind === 'view' ? view.view.members.map(member => member.capability) : view

describe('the extensions a tenant has enabled', () => {
  it('holds an extension that is held and not disabled, has a winning version, a readable declaration, and run on', () => {
    const view = enabledView([facts('probe')], basis)
    expect(view).toEqual({
      kind: 'view',
      view: {
        members: [
          {
            capability: 'probe',
            assetRef: 'asset/probe',
            version: 'v1',
            declaration: declaration('probe'),
          },
        ],
        basis,
      },
    })
  })

  it.each([
    ['the holding is disabled', { holding: 'disabled' }],
    ['no version wins the layers', { winner: { kind: 'none' } }],
    ['run is off', { run: { kind: 'value', value: false } }],
    ['run has no value', { run: { kind: 'absent' } }],
  ] as const)('leaves an extension out when %s', (_name, change) => {
    expect(names(enabledView([facts('kept'), facts('out', change)], basis))).toEqual(['kept'])
  })

  it.each([
    ['the winning version', { winner: { kind: 'unavailable' } }],
    [
      'the declaration of the winning version',
      { winner: { kind: 'version', version: 'v1', declaration: null } },
    ],
    ['the run setting', { run: { kind: 'unavailable' } }],
  ] as const)(
    'is unavailable as a whole when %s is not readable; no partial list',
    (_name, change) => {
      const view = enabledView([facts('kept'), facts('unread', change)], basis)
      expect(view).toEqual({ kind: 'unavailable', capability: 'unread' })
    },
  )

  it('an extension that is out for a plain reason does not make the view unavailable, whatever else of it is unreadable', () => {
    const disabled = facts('off', { holding: 'disabled', run: { kind: 'unavailable' } })
    expect(names(enabledView([disabled], basis))).toEqual([])
  })

  it('is empty, not unavailable, when the tenant holds no extension', () => {
    expect(enabledView([], basis)).toEqual({ kind: 'view', view: { members: [], basis } })
  })
})

describe('the members of a position', () => {
  const later = facts('later', {
    winner: {
      kind: 'version',
      version: 'v2',
      declaration: declaration('later', { position: 'before_terminal' }),
    },
  })
  const each = facts('each', {
    winner: {
      kind: 'version',
      version: 'v1',
      declaration: declaration('each', {
        position: 'after_action',
        dimension: { scope: 'each' },
      }),
    },
  })
  const viewOf = (names: readonly string[]) => {
    const view = enabledView([...names.map(name => facts(name)), later, each], basis)
    expect(view.kind).toBe('view')
    return (view as Extract<typeof view, { kind: 'view' }>).view
  }

  it.each([
    [['zeta', 'alpha', 'mid']],
    [['mid', 'zeta', 'alpha']],
    [['alpha', 'mid', 'zeta']],
    [['zeta', 'mid', 'alpha']],
  ] as const)(
    'are those of the position and the dimension, in ascending order of the capability name: %j',
    held => {
      const view = viewOf(held)
      const at = membersAt(view, { position: 'before_action', dimension: null })
      expect(at.map(member => member.declaration.name)).toEqual(['alpha', 'mid', 'zeta'])
      expect(
        membersAt(view, { position: 'after_action', dimension: { scope: 'each' } }),
      ).toHaveLength(1)
      expect(membersAt(view, { position: 'after_action', dimension: { scope: 'batch' } })).toEqual(
        [],
      )
    },
  )

  it('carry the exact version as the implementation the Agent records and asks for', () => {
    const [member] = membersAt(viewOf(['alpha']), { position: 'before_terminal', dimension: null })
    expect(member?.implementation).toEqual(
      implementationOf({ capability: 'later', assetRef: 'asset/later', version: 'v2' }),
    )
    expect(member?.implementation).toMatchObject({
      owner: 'loop-extension',
      name: 'later',
      revision: 'v2',
    })
  })

  it('reads a member back from the implementation it gave, and none from an implementation of another owner', () => {
    const member = { capability: 'later', assetRef: 'asset/later', version: 'v2' }
    expect(memberOfImplementation(implementationOf(member))).toEqual(member)
    expect(memberOfImplementation({ ...implementationOf(member), owner: 'tool' })).toBeNull()
  })
})
