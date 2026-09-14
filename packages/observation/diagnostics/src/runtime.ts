import type {
  LocalDiagnosticsOptions,
  LocalDiagnosticsResult,
} from './index.js'

export async function createLocalDiagnostics(
  _options: LocalDiagnosticsOptions,
): Promise<LocalDiagnosticsResult> {
  return Object.freeze({ status: 'invalid', code: 'NOT_IMPLEMENTED' })
}
