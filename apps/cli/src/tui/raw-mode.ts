import { InputFailure } from '../diagnostic.ts'

interface RawInput {
  readonly isRaw?: boolean
  setRawMode(enabled: boolean): unknown
  on(event: 'error', listener: () => void): unknown
  off(event: 'error', listener: () => void): unknown
}
/** Node's setRawMode may emit an error synchronously and return without throwing. */
export function setRawChecked(input: RawInput, enabled: boolean): void {
  let failed = false
  const error = () => {
    failed = true
  }
  input.on('error', error)
  try {
    input.setRawMode(enabled)
    if (failed || input.isRaw !== enabled) throw new InputFailure('input-restore-failed')
  } catch {
    throw new InputFailure('input-restore-failed')
  } finally {
    input.off('error', error)
  }
}
