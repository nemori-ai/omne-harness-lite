// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// auto-drive 会话里的 Ask（切片 07，I-14）：发行的 `coding` 定义在本文件里改为 auto-drive。模型在同一轮调 Ask 的
// ask 与 request_approval：两次调用都不运行，没有卡片，没有 Tool 记录；模型收到的工具结果是命令名与不可用的原因。
// 不等 Run 结束：auto-drive 的推进指令是「继续」（session-adapters `conditions.ts`），脚本模型不会自己停，Run 走到
// Agent 的步数护栏才停在失败上，那与 Ask 无关。判定在元能力宿主（`src/entry/meta-capabilities.ts`），值来自 Session 翻译好的协作投影。
// 发行没有在会话进行中切换协作模式的入口，所以「切换之后在等的卡仍可答」不在发行树上：在等的调用不再经过调用准入，
// 由 `tests/entry/tool-requests.spec.ts` 与 Tool 的恢复路径守。
import { describe, expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolLedger,
  toolResults,
} from '../../support/release-tree.ts'

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
    ],
  },
})
const APPROVAL = JSON.stringify({
  command: 'request_approval',
  params: {
    action: 'Delete the build directory',
    reason: 'It holds stale output from an earlier branch.',
    impact: 'The next build takes longer.',
    reversibility: 'The output can be built again.',
    fallback: 'I keep the directory and build into a new one.',
  },
})

describe('Ask in an auto-drive session (I-14)', () => {
  it(
    'neither command runs: no card, no Tool record, and the model reads why',
    { timeout: 240_000 },
    async () => {
      const script = toolCallsThenText(() => [
        { id: 'call_ask', tool: 'Ask', arguments: ASK },
        { id: 'call_approval', tool: 'Ask', arguments: APPROVAL },
      ])
      await onReleaseTree(
        { script, permission: 'bypass-permissions', collaboration: 'auto-drive' },
        async world => {
          const session = await world.startSession('start')
          const history = await pollUntil(
            'the two results of Ask',
            () => historyOf(world, session),
            seen => seen.filter(entry => entry.kind === 'message.tool').length === 2,
          )
          expect(toolResults(history)).toEqual([
            'Ask: the command "ask" is not available now. This session does not let you ask a person (collaboration mode). Continue without the answer, or stop and report what you need.',
            'Ask: the command "request_approval" is not available now. This session does not let you ask a person for approval (collaboration mode). This is not permission: do not do the action.',
          ])
          expect(await world.cards({ states: ['pending', 'decided', 'invalidated'] })).toEqual([])
          expect(toolLedger(world.storageRoot)).toEqual([])
        },
      )
    },
  )
})
