import { repositoryEnv } from '../src/git-environment.ts'

const env = repositoryEnv(process.env)
delete env['OMNE_SUBJECT_ROOT']
delete env['OMNE_RUNNER_ROOT']
for (const key of Object.keys(process.env)) {
  if (!(key in env)) delete process.env[key]
}
