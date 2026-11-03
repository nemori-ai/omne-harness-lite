// Type-level promises: each stage names only the failure kinds of its steps, `pin` gives back
// exactly the moved failure its caller chose, the unions of the contract are not widened by
// this member, and the factories give the contract's interfaces. Nothing here runs.
import { expectTypeOf, test } from 'vitest'
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  Bytes,
  DescribeFailure,
  ExportFailure,
  GateFailure,
  ListFailure,
  PackageEntry,
  PinFailure,
  ReadFailure,
  SkillAccess,
  SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import type { PackageInspection } from '@omne-harness/skill-contract/provider'
import type { createPackageInspection, createSkillAccess, SkillPorts } from '@omne-harness/skill'
import { verifiedBytes, type ByteFailure } from '../src/access/bytes.ts'
import { gate, type Aborted, type Gated } from '../src/access/gate.ts'
import {
  ADOPTED_MATERIAL_CHANGED,
  BASIS_UNAVAILABLE,
  materialOf,
  pin,
  type Pinned,
  type PinStageFailure,
  type SnapshotStageFailure,
  type Unsupported,
} from '../src/access/pin.ts'
import type { OpenSourceFailure, SnapshotSourceFailure } from '../src/mapping.ts'

type Kind<F extends { kind: string }> = F['kind']

declare const ports: SkillPorts<'p', 's'>
declare const access: Access<'p'>
declare const capability: CapabilityId
declare const basis: SkillMaterialBasis
declare const gated: Gated
declare const pinned: Pinned
declare const entry: PackageEntry

test('the factories give the interfaces of the contract', () => {
  expectTypeOf<ReturnType<typeof createPackageInspection>>().toEqualTypeOf<PackageInspection>()
  expectTypeOf<ReturnType<typeof createSkillAccess<'p', 's'>>>().toEqualTypeOf<
    SkillAccess<'p', 's'>
  >()
  expectTypeOf<SkillPorts<'p', 's'>>().toHaveProperty('readCheck')
  expectTypeOf<SkillPorts<'p', 's'>>().toHaveProperty('resolution')
  expectTypeOf<SkillPorts<'p', 's'>>().toHaveProperty('source')
})

test('the gate fails only with the describe failures and the abort', () => {
  expectTypeOf(gate(ports, access, 's', capability, basis, undefined)).resolves.toEqualTypeOf<
    Outcome<Gated, DescribeFailure | Aborted>
  >()
  expectTypeOf<Kind<DescribeFailure>>().toEqualTypeOf<
    'not-available-to-you' | 'unavailable-stand-in' | 'unknown' | 'basis-unavailable'
  >()
})

test('the pin stages are the pin failures without the gate failures', () => {
  expectTypeOf<PinStageFailure>().toEqualTypeOf<Exclude<PinFailure, GateFailure>>()
  expectTypeOf(materialOf(gated)).toEqualTypeOf<Outcome<SkillMaterialBasis, Unsupported>>()
  expectTypeOf<Kind<SnapshotStageFailure>>().toEqualTypeOf<
    'basis-unavailable' | 'source-unavailable' | 'outside-package' | 'aborted'
  >()
  expectTypeOf(pin(ports, gated, basis, BASIS_UNAVAILABLE)).resolves.toEqualTypeOf<
    Outcome<Pinned, SnapshotStageFailure | typeof BASIS_UNAVAILABLE>
  >()
  expectTypeOf(pin(ports, gated, basis, ADOPTED_MATERIAL_CHANGED)).resolves.toEqualTypeOf<
    Outcome<Pinned, SnapshotStageFailure | typeof ADOPTED_MATERIAL_CHANGED>
  >()
  expectTypeOf<'adopted-material-changed'>().not.toExtend<
    Kind<SnapshotStageFailure | typeof BASIS_UNAVAILABLE>
  >()
  expectTypeOf<PinFailure>().toExtend<ListFailure>()
})

test('the bytes stage fails only with the kinds of step 10 and the abort', () => {
  expectTypeOf(verifiedBytes(ports, pinned, entry)).resolves.toEqualTypeOf<
    Outcome<Bytes, ByteFailure>
  >()
  expectTypeOf<Kind<ByteFailure>>().toEqualTypeOf<
    | 'resource-missing'
    | 'version-changed'
    | 'basis-unavailable'
    | 'source-unavailable'
    | 'outside-package'
    | 'aborted'
  >()
  expectTypeOf<ByteFailure>().toExtend<ReadFailure>()
  expectTypeOf<ByteFailure>().toExtend<ExportFailure>()
})

test('the mapping table has one column per source call of the byte operations', () => {
  expectTypeOf<Kind<SnapshotSourceFailure>>().toEqualTypeOf<
    'basis-unavailable' | 'source-unavailable' | 'outside-package'
  >()
  expectTypeOf<Kind<OpenSourceFailure>>().toEqualTypeOf<
    | 'basis-unavailable'
    | 'source-unavailable'
    | 'resource-missing'
    | 'version-changed'
    | 'outside-package'
  >()
})
