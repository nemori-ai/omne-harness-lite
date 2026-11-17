import { describe, expect, it } from 'vitest'
import {
  DECLARATION_PATH,
  LOOP_EXTENSION_CATEGORY,
  LOOP_EXTENSION_PACKAGE_LIMITS,
  RUN_SETTING,
  declarationOf,
  loopExtensionBodyContract,
} from '@omne-harness/loop-extension-contract'
import type { JsonValue, PackageReader } from '@omne-harness/assets'
import { fail } from '@omne-harness/operation-result'
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

const need = (name: string) => ({
  name,
  schema: { owner: 'o', name: 'n', revision: '1', digest: 'd' },
  required: true,
})

describe('a loop extension package', () => {
  it('lives in its own namespace, with its declaration at a fixed path and fixed limits', () => {
    expect(DECLARATION_PATH).toBe('extension.json')
    expect(contract.layout?.namespace).toBe('loop-extensions')
    expect(contract.layout?.limits).toEqual({
      files: 64,
      fileBytes: 1_048_576,
      totalBytes: 4_194_304,
    })
    expect(contract.layout?.limits).toBe(LOOP_EXTENSION_PACKAGE_LIMITS)
  })

  it('opens the declaration by the digest the manifest gives it', async () => {
    const files = packageOf({ [DECLARATION_PATH]: text(builtin()) })
    const opened: string[] = []
    const inspected = await contract.layout!.inspect({
      manifest: () => files.manifest(),
      open(path, expected) {
        opened.push(`${path}@${expected}`)
        return files.open(path, expected)
      },
    })
    const manifest = await files.manifest()
    if ('failure' in manifest) throw new Error('the manifest is readable')
    expect('ok' in inspected).toBe(true)
    expect(opened).toEqual([`${DECLARATION_PATH}@${manifest.ok.entries[0]?.digest}`])
  })

  it.each([
    ['its manifest', { manifest: async () => fail('unavailable' as const) }],
    ['its declaration file', { open: async () => fail('unavailable' as const) }],
  ] as const)(
    'reports a source that fails to give %s as a source failure',
    async (_name, broken) => {
      const files = packageOf({ [DECLARATION_PATH]: text(builtin()) })
      const reader = { ...files, ...broken } as PackageReader
      expect(await contract.layout!.inspect(reader)).toEqual({
        failure: { kind: 'source-failed', failure: 'unavailable' },
      })
    },
  )

  it('a command may declare a need that is not a model call', async () => {
    const body = await bodyOf({
      [DECLARATION_PATH]: text(command({ needs: [need('workspace')] })),
      'check.mjs': '',
    })
    expect(declarationOf(body)?.needs?.map(item => item.name)).toEqual(['workspace'])
  })

  it('a builtin package is its declaration file alone, and its body is the judged declaration', async () => {
    const body = await bodyOf({ [DECLARATION_PATH]: text(builtin()) })
    expect(declarationOf(body)).toEqual(builtin())
    expect(contract.judge(body, { capabilityName: 'probe' })).toEqual({ ok: true })
    expect(contract.category).toBe(LOOP_EXTENSION_CATEGORY)
  })

  it('reads the declaration from a body that came back from storage, and reads none from a tree that is not a body', async () => {
    const body = await bodyOf({ [DECLARATION_PATH]: text(builtin()) })
    const stored: unknown = JSON.parse(JSON.stringify(body))
    expect(declarationOf(stored)).toEqual(builtin())
    expect(contract.judge(stored)).toEqual({ ok: false, rejected: 'incomplete-reference' })
    for (const broken of [
      null,
      'text',
      { kind: 'object' },
      { kind: 'object', entries: [{ key: 'declaration', value: { kind: 'array', items: 7 } }] },
      { kind: 'object', entries: [null] },
    ])
      expect(declarationOf(broken)).toBeNull()
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
      'a command whose entry is the declaration file',
      {
        [DECLARATION_PATH]: text(
          command({
            implementation: {
              kind: 'command',
              interpreter: 'node',
              entry: DECLARATION_PATH,
              timeout: 'PT1S',
            },
          }),
        ),
      },
      'entry-missing',
    ],
    [
      'a command that declares the need of a model call',
      { [DECLARATION_PATH]: text(command({ needs: [need('model')] })), 'check.mjs': '' },
      'command-needs-model',
    ],
    [
      'a command that declares the need of a model call among other needs',
      {
        [DECLARATION_PATH]: text(command({ needs: [need('workspace'), need('model')] })),
        'check.mjs': '',
      },
      'command-needs-model',
    ],
    [
      'a declaration the Agent contract takes and that is too large to be the body of a version',
      {
        [DECLARATION_PATH]: text(
          builtin({
            needs: Array.from({ length: 10 }, (_, index) => need(`${index}-${'n'.repeat(7000)}`)),
          }),
        ),
      },
      'declaration-too-large',
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
