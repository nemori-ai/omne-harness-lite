# governance-client-operations

治理 CLI/TUI 的共享操作提供者。实现状态与边界见[实现映射](../../../.meta_harness/design/realization/packages/frontend/governance-client-operations/README.md)。

```ts
import { createGovernanceClient, exitStatus } from '@omne-harness-lite/governance-client-operations'

const client = createGovernanceClient({ state }) // 已打开的 client-local-state 服务
try {
  const report = await client.runAction({ action: 'health' })
  process.stdout.write(JSON.stringify(report) + '\n')
  process.exitCode = exitStatus(report)
} finally {
  await client.close()
  await state.close() // 依赖由装配者负责，顺序不可颠倒
}
```

`runAction`执行单次动作；`openUse`返回供交互界面持有的固定登录使用，其`run`只接`invoke`/`logout`。服务也可经`governanceClientOperationsPlugin`装入Cordis，注入`clientLocalState`。输入/输出的精确表示由公开`./schema`给出。

公开报告区分远端事实、本地保存结果与数据来源；仅打印该报告，不能打印输入、原始协议登录答复或本地状态。关闭客户端会等已接纳工作结束，不关闭借用的存储。

```sh
pnpm --filter @omne-harness-lite/governance-client-operations build
pnpm --filter @omne-harness-lite/governance-client-operations typecheck
pnpm --filter @omne-harness-lite/governance-client-operations test
```

此包不提供终端命令或交互界面。测试使用临时真实SQLite及明确的运输/提交故障注入；跨平台真实中心驱动的范围见实现映射。

D048/CG2增加`runPrepared(intent, prompt)`与use同名方法：由组合先捕获身份、回调只补对应秘密槽。回调必须最终实际结束且不能await包含自己的close；关闭请求取消后仍等待它。`./schema`保留CG1的Input/Output表示，`./schema/v2`提供Intent/Preview/PromptResult，需同时注册其明确引用的v1 Schema。具体行为权威归设计节点。
