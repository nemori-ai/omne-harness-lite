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
