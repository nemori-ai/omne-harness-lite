import { expectTypeOf, it } from 'vitest'
import type {
  CommandFacility,
  EnvironmentLease,
  EnvironmentNeedDeclaration,
  FacilityKey,
  FacilitySet,
  FileSystemFacility,
  TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import { shellEnvironmentSlot, type ShellEnvironment as ExampleShellEnvironment } from '../examples/shell-needs.ts'

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
