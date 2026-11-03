// @module-tag slow
// Uses real Windows subprocesses, retained terminal sessions and the SQL-backed assembly.
import { expect, it } from 'vitest'

/** The parent assembly supplies this explicit same-commit, real Windows backend exercise. */
it(
  'C06 runs the Windows Shell/Files, retained terminal and single-call termination assembly',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const path = process.env.OMNE_TOOL_WINDOWS_COMPOSITION
    expect(process.platform).toBe('win32')
    if (!path)
      throw new Error(
        'OMNE_TOOL_WINDOWS_COMPOSITION must name the real Windows assembly runner; frozen facilities cannot satisfy C06.',
      )
    const module: unknown = await import(path)
    if (
      typeof module !== 'object' ||
      module === null ||
      !('runWindowsToolComposition' in module) ||
      typeof module.runWindowsToolComposition !== 'function'
    )
      throw new Error('The Windows assembly must export runWindowsToolComposition.')
    const result: unknown = await module.runWindowsToolComposition()
    expect(result).toMatchObject({
      backend: 'windows-real',
      files: 'passed',
      shell: 'passed',
      failureClosure: 'passed',
      retainedTerminal: 'passed',
      targetStopped: true,
      otherCallContinued: true,
      originalConsumerSaved: true,
    })
  },
)
