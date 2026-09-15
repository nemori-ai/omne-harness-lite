import type {
  DiagnosticClose,
  DiagnosticContext,
  DiagnosticEnd,
  DiagnosticGap,
  DiagnosticGapReason,
  DiagnosticIdentity,
  DiagnosticPoint,
  DiagnosticDirectoryClose,
  DiagnosticDirectoryStatus,
  Diagnostics,
  DiagnosticsDirectoryCleanup,
  DiagnosticsRuntime,
  DiagnosticSpan,
  DiagnosticStatus,
  LocalDiagnosticSourceOptions,
  LocalDiagnosticSourceResult,
  LocalDiagnosticsDirectory,
  LocalDiagnosticsDirectoryOptions,
  LocalDiagnosticsDirectoryResult,
} from '../dist/index.js'
import { createLocalDiagnosticsDirectory } from '../dist/index.js'

type EveryPublicType = [
  DiagnosticClose,
  DiagnosticContext,
  DiagnosticEnd,
  DiagnosticGap,
  DiagnosticGapReason,
  DiagnosticIdentity,
  DiagnosticPoint,
  DiagnosticDirectoryClose,
  DiagnosticDirectoryStatus,
  Diagnostics,
  DiagnosticsDirectoryCleanup,
  DiagnosticsRuntime,
  DiagnosticSpan,
  DiagnosticStatus,
  LocalDiagnosticSourceOptions,
  LocalDiagnosticSourceResult,
  LocalDiagnosticsDirectory,
  LocalDiagnosticsDirectoryOptions,
  LocalDiagnosticsDirectoryResult,
]

const everyPublicTypeCompiles: EveryPublicType | undefined = undefined
void everyPublicTypeCompiles
void createLocalDiagnosticsDirectory

// @ts-expect-error contexts are opaque handles issued only by a diagnostics instance
const forgedContext: DiagnosticContext = {}
void forgedContext
