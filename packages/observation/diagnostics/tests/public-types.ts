import type {
  DiagnosticClose,
  DiagnosticContext,
  DiagnosticEnd,
  DiagnosticGap,
  DiagnosticGapReason,
  DiagnosticIdentity,
  DiagnosticPoint,
  Diagnostics,
  DiagnosticsRuntime,
  DiagnosticSpan,
  DiagnosticStatus,
  LocalDiagnosticsOptions,
  LocalDiagnosticsResult,
} from '../dist/index.js'
import { createLocalDiagnostics } from '../dist/index.js'

type EveryPublicType = [
  DiagnosticClose,
  DiagnosticContext,
  DiagnosticEnd,
  DiagnosticGap,
  DiagnosticGapReason,
  DiagnosticIdentity,
  DiagnosticPoint,
  Diagnostics,
  DiagnosticsRuntime,
  DiagnosticSpan,
  DiagnosticStatus,
  LocalDiagnosticsOptions,
  LocalDiagnosticsResult,
]

const everyPublicTypeCompiles: EveryPublicType | undefined = undefined
void everyPublicTypeCompiles
void createLocalDiagnostics

// @ts-expect-error contexts are opaque handles issued only by a diagnostics instance
const forgedContext: DiagnosticContext = {}
void forgedContext
