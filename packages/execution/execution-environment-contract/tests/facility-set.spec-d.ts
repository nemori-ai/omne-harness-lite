import { expectTypeOf, it } from 'vitest'
import type {
  CommandFacility,
  EnvironmentLease,
  EnvironmentNeedDeclaration,
  FacilityKey,
  FacilityOperation,
  FacilitySet,
  FileSystemFacility,
  TerminalFacility,
  TerminalRetentionOperation,
} from '@omne-harness/execution-environment-contract'
import { describeFacility, terminalFacility } from '@omne-harness/execution-environment-contract'
import {
  createMemoryFileSystem,
  createScriptedCommandFacility,
  type ProviderScript,
} from '@omne-harness/execution-environment-contract/testing'
import {
  shellEnvironmentSlot,
  type ShellEnvironment as ExampleShellEnvironment,
} from '../examples/shell-needs.ts'

it('accepts legacy four-operation terminals without attachment methods', () => {
  type Legacy = Pick<TerminalFacility<unknown>, 'create' | 'execute' | 'close' | 'list'>
  expectTypeOf<Legacy>().toExtend<TerminalFacility<unknown>>()
  expectTypeOf<undefined>().toExtend<TerminalFacility<unknown>['retention']>()
  expectTypeOf<TerminalRetentionOperation>().toEqualTypeOf<'attach' | 'detach'>()
})

it('keeps the complete four-operation consumer mapping and descriptor source compatible', () => {
  const labels: Record<FacilityOperation<'terminal'>, { text: string }> = {
    create: { text: 'create' },
    execute: { text: 'execute' },
    close: { text: 'close' },
    list: { text: 'list' },
  }
  terminalFacility.operations.map(operation => labels[operation].text)
  describeFacility('terminal', {
    create: 'guarded',
    execute: 'guarded',
    close: 'guarded',
    list: 'guarded',
  })
  expectTypeOf<FacilityOperation<'terminal'>>().toEqualTypeOf<
    'create' | 'execute' | 'close' | 'list'
  >()
})

it('compiles the Shell example in examples/ against the public entry', () => {
  expectTypeOf<ExampleShellEnvironment>().toEqualTypeOf<{
    command: CommandFacility<unknown>
    terminal: TerminalFacility<unknown>
  }>()
  expectTypeOf(shellEnvironmentSlot.value).toExtend<EnvironmentNeedDeclaration>()
})

const shellNeeds = {
  facilities: ['command', 'terminal'],
  isolation: ['process'],
  layers: ['host_machine', 'session_sandbox', 'tenant_sandbox'],
} as const satisfies EnvironmentNeedDeclaration

type ShellEnvironment = FacilitySet<(typeof shellNeeds)['facilities'][number]>

it('gives a Shell executor only the facilities its declaration names', () => {
  expectTypeOf<ShellEnvironment>().toEqualTypeOf<{
    command: CommandFacility<unknown>
    terminal: TerminalFacility<unknown>
  }>()
  const execute = (env: ShellEnvironment) => {
    // @ts-expect-error the declaration does not name 'files'
    void env.files
    return env.terminal
  }
  expectTypeOf(execute).returns.toEqualTypeOf<TerminalFacility<unknown>>()
})

it('registers the three core facility keys and keeps the key set open', () => {
  expectTypeOf<'files' | 'command' | 'terminal'>().toExtend<FacilityKey>()
  expectTypeOf<FacilitySet<'files'>['files']>().toEqualTypeOf<FileSystemFacility<unknown>>()
})

it('refuses a declaration that names a binding layer that does not exist', () => {
  const declaration = {
    facilities: ['files'],
    isolation: [],
    // @ts-expect-error 'cloud' is not a binding layer
    layers: ['cloud'],
  } satisfies EnvironmentNeedDeclaration
  void declaration
})

it('types a lease facility by its key', () => {
  expectTypeOf<ReturnType<EnvironmentLease<'files'>['facility']>>().toEqualTypeOf<
    FileSystemFacility<unknown> | undefined
  >()
})

it('fits the two facility doubles into a facility set and a scripted lease', () => {
  const fs = createMemoryFileSystem()
  const cmd = createScriptedCommandFacility(() => ({ kind: 'unknown' }))
  const lease = { files: fs.facility, command: cmd.facility }
  expectTypeOf(lease).toExtend<FacilitySet<'files' | 'command'>>()
  expectTypeOf(lease).toExtend<NonNullable<ProviderScript['lease']>>()
})
