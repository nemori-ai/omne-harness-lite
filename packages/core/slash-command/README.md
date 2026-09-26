# @omne-harness-lite/slash-command

`data.slash-command` v2 的纯 TypeScript 实现。采用版本及接受依据见
[registry](../../../.meta_harness/design/registry/README.md)，接口及调用前提见
[realization](../../../.meta_harness/design/realization/packages/core/slash-command/design.md)，
规范例与判定次序见[契约](../../../.meta_harness/design/spec/data/slash-command/v2/contract.md)。

公开入口提供 `recognize`、`parseInvocation`、`expandPrompt`、`expandSkill`，
`judgeSlashCommand`、`judgeInvocation`、九个固定 Schema 定义的 `validate` 与
`judgeSlashCommandValue`，以及 `slashCommandBodyContract`、属性声明与引用投影。
Schema 通过 `@omne-harness-lite/slash-command/schema` 公开，保持冻结资源的原始字节。

```ts
import { recognize, parseInvocation } from '@omne-harness-lite/slash-command'

const input = recognize('/summarize full raw text')
if (input.kind === 'invocation') {
  const result = parseInvocation(input.invocation, {
    summarize: {
      description: 'Summarize the supplied text',
      binding: { kind: 'prompt', template: 'Summarize: $ARGUMENTS' },
    },
  })
  // result: { kind: 'expanded', text: 'Summarize: full raw text' }
}
```

导出通过构建产物消费；包内 `src/` 不供跨包导入。调用方提供合法命令集；
`expandPrompt` 的调用方还保证定义与本次名字配对。`expandSkill` 接收调用方已经选好、
核权的合法 SkillPackage，以及每个实际输出块的 id 与 visibility；它保留正文和参数原文。
辅助函数的技术前提违例给 `TypeError`，表示层判定仍返回六个既有拒绝值，解析结果恰四支。
缺少资产记录上下文的局部正文判断不等于完整记录接收。

本包不执行服务、shell 或工具，不访问目录、权限、存储、时钟或 Cordis。
交付/受理面实际调用、受理重判、发布动作名集合、失败不发送、权限核实、留痕和跨进程
一致性由[verification](../../../.meta_harness/design/spec/data/slash-command/verification.md)
点名的消费者承担。G-7～G-9 保留在权威契约中。

```sh
pnpm --filter @omne-harness-lite/slash-command build
pnpm --filter @omne-harness-lite/slash-command typecheck
pnpm --filter @omne-harness-lite/slash-command test
pnpm run lint:rules
```

`tests/normative.spec.ts` 逐行消费冻结 examples，包含 D-01～D-50 在人读、机读和受理三种
调用形态下的同一实现；这不表示已验证另一语言实现。`boundaries.spec.ts` 使用固定预期
检查 Unicode、切分、优先级、精确整数和模板边界，`projections.spec.ts` 检查端口、原文
块及冻结字节，`public.spec-d.ts` 保持结果分支、品牌和正文类别的负向类型证据。
