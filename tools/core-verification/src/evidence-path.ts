import { isAbsolute, join, relative, resolve } from 'node:path'

/** Caller selects a run-owned root; legacy defaults remain unchanged. */
export function evidencePath(
  repository: string,
  defaultRelativePath: string,
  area: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment.OMNE_CORE_VERIFICATION_EVIDENCE_ROOT
  if (configured === undefined) return join(repository, defaultRelativePath)
  if (configured.length === 0) throw new Error('evidence root must not be empty')
  const root = resolve(repository, configured)
  const withinTmp = relative(join(repository, 'tmp'), root)
  if (isAbsolute(withinTmp) || withinTmp === '..' || withinTmp.startsWith('../'))
    throw new Error('evidence root must be inside this repository tmp directory')
  return join(root, area)
}
