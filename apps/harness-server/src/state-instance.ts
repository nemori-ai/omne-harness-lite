import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** A state directory a lab instance made carries this file; the two kinds of instance never share one. */
export const LAB_MARKER = 'lab-instance.json'

export type Instance = 'release' | 'lab'

export const isLabRoot = (dir: string): boolean => existsSync(join(dir, LAB_MARKER))

/** Why this instance may not start on the directory, or undefined when it may. */
export function refusedInstance(dir: string, instance: Instance): string | undefined {
  const lab = isLabRoot(dir)
  if (instance === 'release' && lab)
    return `state-root-is-lab: ${dir} belongs to a lab instance on simulated time`
  if (instance === 'lab' && !lab) return `state-root-not-lab: ${dir} was not made by a lab instance`
  return undefined
}

export type Claim =
  | Readonly<{ kind: 'claimed'; fresh: boolean }>
  | Readonly<{ kind: 'refused'; reason: string }>

/** A lab instance takes a directory that is absent or empty, or one it marked before. */
export function claimLabRoot(dir: string): Claim {
  if (isLabRoot(dir)) return { kind: 'claimed', fresh: false }
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (readdirSync(dir).length > 0)
    return { kind: 'refused', reason: `state-root-not-lab: ${dir} holds state of another instance` }
  writeFileSync(join(dir, LAB_MARKER), `${JSON.stringify({ instance: 'lab', version: 1 })}\n`, {
    mode: 0o600,
  })
  return { kind: 'claimed', fresh: true }
}
