import type { CommandRequest } from './facilities.ts'
import { text, bytes, shape, env, type Check } from './facility-input.ts'
const args: Check = value => Array.isArray(value) && value.every(item => typeof item === 'string')
/** Byte ownership is copied before authorization or the first external effect. */
export function captureCommandRequest(input: unknown): CommandRequest | undefined {
  try {
    const captured: unknown = structuredClone(input)
    if (
      !shape(captured, { executable: text, args, cwd: text, env, stdin: bytes }, [
        'executable',
        'args',
        'cwd',
        'env',
      ])
    )
      return undefined
    const value = captured as CommandRequest
    return Object.freeze({
      executable: value.executable,
      cwd: value.cwd,
      args: Object.freeze([...value.args]),
      env: Object.freeze({ ...value.env }),
      ...(value.stdin ? { stdin: value.stdin } : {}),
    })
  } catch {
    return undefined
  }
}
