import { describe, expect, it } from 'vitest'
import {
  DECLARATION_PATH,
  LOOP_EXTENSION_CATEGORY,
  RUN_SETTING,
  declarationOf,
  loopExtensionBodyContract,
} from '@omne-harness/loop-extension-contract'
import type { JsonValue } from '@omne-harness/assets'
import { builtin, command, packageOf, text } from './support.ts'

const contract = loopExtensionBodyContract()
const inspect = (files: Record<string, string>) => contract.layout!.inspect(packageOf(files))
const rejected = async (files: Record<string, string>) => {
  const inspected = await inspect(files)
  return 'failure' in inspected ? inspected.failure : null
}
const bodyOf = async (files: Record<string, string>): Promise<JsonValue> => {
  const inspected = await inspect(files)
  if ('failure' in inspected) throw new Error(JSON.stringify(inspected.failure))
  return inspected.ok
}

describe('a loop extension package', () => {
  it('a builtin package is its declaration file alone, and its body is the judged declaration', async () => {
    const body = await bodyOf({ [DECLARATION_PATH]: text(builtin()) })
    expect(declarationOf(body)).toEqual(builtin())
    expect(contract.judge(body, { capabilityName: 'probe' })).toEqual({ ok: true })
    expect(contract.category).toBe(LOOP_EXTENSION_CATEGORY)
  })

  it('a command package carries its entry file, and the body names the interpreter, the entry and the timeout', async () => {
    const body = await bodyOf({
      [DECLARATION_PATH]: text(command()),
      'check.mjs': 'process.stdout.write("{}")',
    })
    expect(declarationOf(body)?.implementation).toEqual({
      kind: 'command',
      interpreter: 'node',
      entry: 'check.mjs',
      timeout: 'PT10S',
    })
  })

  it.each([
    ['no declaration file', { 'check.mjs': '' }, 'declaration-missing'],
    ['a declaration that is not JSON', { [DECLARATION_PATH]: '{' }, 'declaration-not-json'],
    [
      'a declaration the Agent contract refuses',
      { [DECLARATION_PATH]: text(builtin({ position: 'nowhere' })) },
      'declaration-refused: unknown-position',
    ],
    [
      'an error policy the position does not allow',
      {
        [DECLARATION_PATH]: text(builtin({ position: 'after_terminal', onError: 'treat_as_veto' })),
      },
      'declaration-refused',
    ],
    [
      'a command whose entry is not in the package',
      { [DECLARATION_PATH]: text(command()) },
      'entry-missing',
    ],
    [
      'a command whose entry leaves the package',
      {
        [DECLARATION_PATH]: text(
          command({
            implementation: {
              kind: 'command',
              interpreter: 'node',
              entry: '../x',
              timeout: 'PT1S',
            },
          }),
        ),
      },
      'entry-missing',
    ],
    [
      'a command that declares the need of a model call',
      {
        [DECLARATION_PATH]: text(
          command({
            needs: [
              {
                name: 'model',
                schema: { owner: 'o', name: 'n', revision: '1', digest: 'd' },
                required: true,
              },
            ],
          }),
        ),
        'check.mjs': '',
      },
      'command-needs-model',
    ],
  ])('refuses %s', async (_name, files, reason) => {
    const refusal = await rejected(files as Record<string, string>)
    expect(refusal?.kind).toBe('invalid-package')
    expect(refusal?.kind === 'invalid-package' && refusal.reason).toContain(reason)
  })
})

describe('the body of a version', () => {
  it('is refused when the declared name is not the capability name', async () => {
    const body = await bodyOf({ [DECLARATION_PATH]: text(builtin()) })
    expect(contract.judge(body, { capabilityName: 'other' })).toEqual({
      ok: false,
      rejected: 'name-mismatch',
    })
  })

  it.each([null, 'text', {}, { declaration: null }, { declaration: { name: 'probe' } }])(
    'is refused when it is not a declaration: %j',
    body => {
      expect(contract.judge(body).ok).toBe(false)
    },
  )

  it('composes no other asset, and declares its position, power and kind of implementation', async () => {
    const body = await bodyOf({ [DECLARATION_PATH]: text(builtin()) })
    expect(contract.references(body)).toEqual([])
    expect(contract.deriveDeclarations(body).entries).toEqual([
      'position:before_action',
      'power:veto',
      'implementation:builtin',
    ])
  })
})

describe('the run setting', () => {
  it('every extension declares one boolean setting that is off by default', async () => {
    const body = await bodyOf({ [DECLARATION_PATH]: text(builtin()) })
    const settings = contract.settings?.(body, { capabilityName: 'probe', definition: 'v1' })
    expect(settings?.definitionId).toBe('probe')
    expect(settings?.version).toBe('v1')
    expect(settings?.items).toEqual([
      expect.objectContaining({
        id: RUN_SETTING,
        valueSchema: { type: 'boolean' },
        default: { kind: 'value', value: false },
        sensitivity: 'ordinary',
      }),
    ])
  })
})
