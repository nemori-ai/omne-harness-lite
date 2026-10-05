# governance-client-operations-local

治理 CLI/TUI 的共享操作提供者。本包实现公共操作定义，行为与未迁业务源见[SPEC](SPEC.md)。

```ts
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'
import { createGovernanceTransport } from '@omne-harness-lite/governance-center-client-https'

const transport = createGovernanceTransport()

const client = createGovernanceClient({ state, transport }) // 已打开的 client-local-state 服务
try {
  const report = await client.runAction({ action: 'health' })
  process.stdout.write(JSON.stringify(report) + '\n')
  process.exitCode = exitStatus(report)
} finally {
  await client.close()
  await transport.close()
  await state.close() // 依赖由装配者负责，顺序不可颠倒
}
```

`runAction`执行单次动作；`openUse`返回供交互界面持有的固定登录使用，其`run`只接`invoke`/`logout`。绑定从本包 `./cordis` 导入，必需注入 `clientLocalState` 和 `governanceTransport`。输入/输出及预备输入的Schema由公共 governance-client-operations 包拥有。

公开报告区分远端事实、本地保存结果与数据来源；仅打印该报告，不能打印输入、原始协议登录答复或本地状态。关闭客户端会等已接纳工作结束，不关闭借用的存储。

```sh
pnpm --filter @omne-harness-lite/governance-client-operations-local build
pnpm --filter @omne-harness-lite/governance-client-operations-local typecheck
pnpm --filter @omne-harness-lite/governance-client-operations-local test
```

此包不提供终端命令或交互界面。测试使用临时真实SQLite及明确的运输/提交故障注入；跨平台真实中心驱动的范围见对应验收证据。

D048/CG2增加`runPrepared(intent, prompt)`与use同名方法：由组合先捕获身份、回调只补对应秘密槽。回调必须最终实际结束且不能await包含自己的close；关闭请求取消后仍等待它。公共定义的`./schema`保留CG1的Input/Output表示，`./schema/v2`提供Intent/Preview/PromptResult，需同时注册其明确引用的v1 Schema。具体承诺和仍有效的业务源见本包 SPEC。
