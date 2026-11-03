// Type-level promises: each stage names only the failure kinds of its steps, a gate with a basis
// pins without `adopted-material-changed`, the unions of the contract are not widened by this
// member, and the factories give the contract's interfaces. Nothing here runs.
import { expectTypeOf, test } from 'vitest'
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  DescribeFailure,
  ExportFailure,
  ListFailure,
  PinFailure,
  ReadFailure,
  SkillAccess,
  SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import type { PackageInspection } from '@omne-harness/skill-contract/provider'
import type { createPackageInspection, createSkillAccess, SkillPorts } from '@omne-harness/skill'
import { verifiedBytes, type ByteFailure, type Verified } from '../src/access/bytes.ts'
import { gate, type Gated, type GatedWithBasis } from '../src/access/gate.ts'
import { pin, type Pinned, type PinnedWithBasis } from '../src/access/pin.ts'
import type { AccessSourceFailure, SourceOp } from '../src/mapping.ts'

type Kind<F extends { kind: string }> = F['kind']

declare const ports: SkillPorts<'p', 's'>
declare const access: Access<'p'>
declare const capability: CapabilityId
declare const basis: SkillMaterialBasis
declare const plain: Gated
declare const withBasis: GatedWithBasis
declare const pinned: Pinned

test('the factories give the interfaces of the contract', () => {
  expectTypeOf<ReturnType<typeof createPackageInspection>>().toEqualTypeOf<PackageInspection>()
  expectTypeOf<ReturnType<typeof createSkillAccess<'p', 's'>>>().toEqualTypeOf<
    SkillAccess<'p', 's'>
  >()
  expectTypeOf<SkillPorts<'p', 's'>>().toHaveProperty('readCheck')
  expectTypeOf<SkillPorts<'p', 's'>>().toHaveProperty('resolution')
  expectTypeOf<SkillPorts<'p', 's'>>().toHaveProperty('source')
})

test('the gate fails only with the describe failures, and keeps the basis in its type', () => {
  expectTypeOf(gate(ports, access, 's', capability)).resolves.toEqualTypeOf<
    Outcome<Gated, DescribeFailure>
  >()
  expectTypeOf(gate(ports, access, 's', capability, basis)).resolves.toEqualTypeOf<
    Outcome<GatedWithBasis, DescribeFailure>
  >()
  expectTypeOf<Kind<DescribeFailure>>().toEqualTypeOf<
    'not-available-to-you' | 'unavailable-stand-in' | 'unknown' | 'basis-unavailable'
  >()
})

test('a pin with a basis cannot answer adopted-material-changed', () => {
  expectTypeOf(pin(ports, plain)).resolves.toEqualTypeOf<Outcome<Pinned, PinFailure>>()
  expectTypeOf(pin(ports, withBasis)).resolves.toEqualTypeOf<
    Outcome<PinnedWithBasis, Exclude<PinFailure, { kind: 'adopted-material-changed' }>>
  >()
  expectTypeOf<PinFailure>().toExtend<ListFailure>()
})

test('the bytes stage fails only with the kinds of steps 9 and 10 and the abort', () => {
  expectTypeOf(verifiedBytes(ports, pinned, 'SKILL.md')).resolves.toEqualTypeOf<
    Outcome<Verified, ByteFailure>
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

test('the mapping table names only its two consumers and the access failures', () => {
  expectTypeOf<SourceOp>().toEqualTypeOf<'inspect' | 'access'>()
  expectTypeOf<Kind<AccessSourceFailure>>().toEqualTypeOf<
    | 'basis-unavailable'
    | 'source-unavailable'
    | 'resource-missing'
    | 'version-changed'
    | 'outside-package'
  >()
})
