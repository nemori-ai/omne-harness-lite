import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'

const env = repositoryEnv(process.env)
delete env['OMNE_SUBJECT_ROOT']
delete env['OMNE_RUNNER_ROOT']
// The host's cloud detection must not move the direct-path tests onto the delivery-facts path;
// the tests that exercise that path set these variables themselves.
delete env['CCR_AGENT_PROXY_ENABLED']
delete env['OMNE_DELIVERY_FACTS']
for (const key of Object.keys(process.env)) {
  if (!(key in env)) delete process.env[key]
}
