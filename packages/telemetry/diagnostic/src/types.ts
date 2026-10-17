export type OriginCause = {
  readonly role: 'origin'
  readonly summary: string
  readonly detail?: Readonly<Record<string, string>>
}

export type AttachedCause = {
  readonly role: 'attached'
  readonly summary: string
  readonly detail?: Readonly<Record<string, string>>
}

export type CallerCause = OriginCause | AttachedCause

export type ExportCause = {
  readonly role: 'export'
  readonly summary: string
}

export type DiagnosticCause = CallerCause | ExportCause

export type CallerChain = {
  readonly causes: readonly [OriginCause, ...AttachedCause[]]
}

export type FailureChain = {
  readonly causes: readonly DiagnosticCause[]
}

export type Correlation = {
  readonly tenant: string
  readonly work?: string
  readonly attempt?: string
  readonly instance?: string
  readonly generation?: string
}

export type DiagnosticBounds = {
  readonly profile: string
  readonly os: string
  readonly node: string
  readonly load: string
  readonly overLimit: 'reject'
  readonly maxQueue: number
  readonly maxExportBytes: number
  readonly maxInFlight: number
}

export type AdmitInput = {
  readonly chain: CallerChain
  readonly correlation: Correlation
}

export type AdmitResult =
  | { readonly status: 'accepted'; readonly id: string }
  | { readonly status: 'gap'; readonly reason: 'sink_absent'; readonly id: string }
  | {
      readonly status: 'rejected'
      readonly reason: 'queue_full' | 'bytes_full' | 'in_flight_full' | 'closed'
    }

export type ExportStatus =
  | 'queued'
  | 'exporting'
  | 'exported'
  | 'export_failed'
  | 'closed_unexported'
  | 'gap'

export type ReadResult =
  | { readonly status: 'absent' }
  | { readonly status: 'denied' }
  | {
      readonly status: 'visible'
      readonly exportStatus: ExportStatus
      readonly chain: FailureChain
    }

export type LastRecordFact =
  | { readonly kind: 'none' }
  | { readonly kind: 'handed-off'; readonly id: string }
  | { readonly kind: 'unhanded'; readonly id: string }

export type FlushFact =
  | { readonly kind: 'deadline' }
  | {
      readonly kind: 'counted'
      readonly exported: number
      readonly dropped: number
      readonly failed: number
    }

export type TransportFact = { readonly kind: 'deadline' } | { readonly kind: 'unconfirmed' }

export type DiagnosticCloseReport = {
  readonly status: 'closed'
  readonly unfinished: readonly string[]
  readonly exportFailed: readonly string[]
  readonly lastRecord: LastRecordFact
  readonly flush: FlushFact
  readonly transport: TransportFact
}

export type ExportedRecord = {
  readonly id: string
  readonly chain: FailureChain
  readonly correlation: Correlation
  readonly bytes: number
}

export type DiagnosticSink = {
  export(record: ExportedRecord, signal: AbortSignal): Promise<void>
}

export type DiagnosticPort = {
  readonly bounds: DiagnosticBounds
  admit(input: AdmitInput): AdmitResult
  read(input: { readonly tenant: string; readonly id: string }): ReadResult
  close(): Promise<DiagnosticCloseReport>
}

export type DiagnosticPortOptions = {
  readonly bounds: DiagnosticBounds
  readonly sink: DiagnosticSink | null
  readonly closeDeadlineMs: number
}
