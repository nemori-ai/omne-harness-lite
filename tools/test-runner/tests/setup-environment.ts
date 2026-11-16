import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'

const env = repositoryEnv(process.env)
delete env['OMNE_SUBJECT_ROOT']
delete env['OMNE_RUNNER_ROOT']
for (const key of Object.keys(process.env)) {
  if (!(key in env)) delete process.env[key]
}
// 用例里起的运行（testStep、acceptanceStep、recordedRun）去整机令牌池要令牌时，不排进这台机器真的令牌池：
// 池子的目录指到本工作进程自己的临时目录。要测令牌池本身的用例各自再给目录。
process.env['OMNE_TEST_SLOT_DIR'] = join(tmpdir(), `omne-test-runner-tokens-${process.pid}`)
