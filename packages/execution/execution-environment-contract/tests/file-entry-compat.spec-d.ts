import { expectTypeOf, it } from 'vitest'
import type {
  FacilityResult,
  FileIdentity,
  FileInformation,
  FileSystemFacility,
} from '@omne-harness/execution-environment-contract'

type LegacyList = (request: Parameters<FileSystemFacility<unknown>['list']>[0]) => Promise<
  FacilityResult<{
    readonly directory: FileIdentity
    readonly entries: readonly FileInformation[]
    readonly nextOffset?: number
  }>
>

it('keeps an existing list writer without entry names assignable', () => {
  const acceptLegacy = (writer: LegacyList): FileSystemFacility<unknown>['list'] => writer
  expectTypeOf(acceptLegacy).returns.toEqualTypeOf<FileSystemFacility<unknown>['list']>()
})
