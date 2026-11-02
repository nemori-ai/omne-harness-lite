import { expectTypeOf, it } from 'vitest'
import type {
  FileIdentity,
  FileInformation,
  FileSystemFacility,
  FileWriteResult,
  FacilityResult,
} from '@omne-harness/execution-environment-contract'

it('adds an optional write effect only to the write result', () => {
  expectTypeOf<Awaited<ReturnType<FileSystemFacility<unknown>['write']>>>().toEqualTypeOf<
    FacilityResult<FileWriteResult>
  >()
  expectTypeOf<FileWriteResult['writeEffect']>().toEqualTypeOf<
    'created' | 'in-place' | 'replaced' | undefined
  >()
  expectTypeOf<FileIdentity>().toExtend<FileWriteResult>()
  expectTypeOf<Awaited<ReturnType<FileSystemFacility<unknown>['stat']>>>().toEqualTypeOf<
    FacilityResult<FileInformation>
  >()
  expectTypeOf<'writeEffect'>().not.toExtend<keyof FileInformation>()
})
