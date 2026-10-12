import { expectTypeOf, test } from 'vitest'
import type {
  ExecutionEnvironmentOperations,
  EnvironmentProviderRegistrations,
  EnvironmentPlacementRegistrations,
  EnvironmentDescription,
  CommandFacility,
  FileFacility,
  EnvironmentFacilityMap,
} from '../src/index.ts'
import type { ExecutionEnvironmentsService } from '../src/cordis.ts'

test('Cordis ABC derives every callable signature from the shared owner', () => {
  expectTypeOf<ExecutionEnvironmentsService['resolvePlacement']>().toEqualTypeOf<
    ExecutionEnvironmentOperations['resolvePlacement']
  >()
  expectTypeOf<ExecutionEnvironmentsService['acquire']>().toEqualTypeOf<
    ExecutionEnvironmentOperations['acquire']
  >()
  expectTypeOf<ExecutionEnvironmentsService['recover']>().toEqualTypeOf<
    EnvironmentProviderRegistrations['recover']
  >()
  expectTypeOf<ExecutionEnvironmentsService['registerPlacementSource']>().toEqualTypeOf<
    EnvironmentPlacementRegistrations['registerPlacementSource']
  >()
})

test('facility ports compose and the binding layer statically agrees with the owner variant', () => {
  expectTypeOf<EnvironmentFacilityMap['command']>().toEqualTypeOf<CommandFacility>()
  expectTypeOf<EnvironmentFacilityMap['files']>().toEqualTypeOf<FileFacility>()
  expectTypeOf<Pick<EnvironmentFacilityMap, 'command' | 'files'>>().toExtend<{
    command: CommandFacility
    files: FileFacility
  }>()
  expectTypeOf<
    Extract<EnvironmentDescription, { bindingLayer: 'stateless_sandbox' }>['binding']['kind']
  >().toEqualTypeOf<'stateless_sandbox'>()
})

test('owned recovery ABC and complete facilities use the same public protocol types', () => {
  expectTypeOf<ExecutionEnvironmentsService['recoverOwned']>().toEqualTypeOf<
    EnvironmentProviderRegistrations['recoverOwned']
  >()
  expectTypeOf<Parameters<CommandFacility['createTerminal']>[0]>().toEqualTypeOf<
    import('../src/index.ts').TerminalCreateRequest
  >()
  expectTypeOf<Parameters<CommandFacility['executeTerminal']>[0]>().toEqualTypeOf<
    import('../src/index.ts').TerminalExecuteRequest
  >()
  expectTypeOf<Parameters<FileFacility['read']>[0]>().toEqualTypeOf<
    import('../src/index.ts').FileReadRequest
  >()
  expectTypeOf<Awaited<ReturnType<FileFacility['commitBatch']>>>().toEqualTypeOf<
    import('../src/index.ts').FileBatchResult | import('../src/index.ts').FacilityFailure
  >()
})
