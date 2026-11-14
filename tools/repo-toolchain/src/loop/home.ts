import { join, resolve } from 'node:path'

export function loopHome(mainRoot: string, env: NodeJS.ProcessEnv): string {
  return resolve(env['OMNE_METRICS_HOME'] ?? join(mainRoot, 'tmp', 'clean-loop'))
}
