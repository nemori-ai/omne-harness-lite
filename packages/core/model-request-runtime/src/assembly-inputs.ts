import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { LoadedImageCodec } from './image-codec.ts'
import type { RetirementPolicy } from './retirement-policy.ts'
import type { Diagnostic } from './transport-diagnostic.ts'
import type { DiagnosticEmitter } from './diagnostic-events.ts'
import type { InputMeter } from './input-meter.ts'

export interface ModelTransportSupport {
  readonly imageCodec?: LoadedImageCodec | null
  readonly retirementSchedule: RetirementPolicy['schedule']
  readonly onDiagnostic?: (event: Diagnostic) => void | Promise<void>
  readonly registryDiagnostics?: Pick<DiagnosticEmitter, 'record'>
}
export type MeterCoordinates = Pick<
  InputMeter,
  'modelId' | 'definitionRevision' | 'implementation' | 'provider'
>
export interface ModelInputMeters {
  readonly select: (coordinates: MeterCoordinates) => InputMeter | { readonly unavailable: true }
}
export interface ModelRetrySample {
  readonly sample: () => JsonNumber | { readonly unavailable: true }
}
/** Used only by the controlled transport assembly. */
export interface DevelopmentTransportTls {
  readonly readCa: () => readonly string[]
}
