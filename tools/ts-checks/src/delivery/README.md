# 观察 GitHub 交付结构

检查器生成偏离、unknown 和 uncovered 报告。报告帮助负责人定位下一项核对，不授予 Ready、认领或接受权限。公开行为及限制归[SPEC](SPEC.md)。

## 从离线采集读取

在仓库根运行以下命令。配置须为`github-delivery-config@2`、协议2，采集须为`github-delivery-capture@1`、协议2，包含原始正文和各层完整性。输出报告为`github-delivery-report@4`、协议2，TaskBinding仍为版本1。旧配置、协议1采集与版本1/2/3报告输入退出2，不转换。

```sh
node --experimental-strip-types tools/ts-checks/src/delivery/cli.ts \
  --config docs/engineering/github-delivery.json \
  --capture tmp/<task>/capture.json \
  --report tmp/<task>/delivery-report.json
```

再次观察时，用 `--baseline tmp/<task>/previous-report.json` 比较。同仓库、Project与口径才能比较。读取不全时，工具不会把未读到的旧项计为已解决。

## 显式读取 GitHub

先在交互环境配置 `gh` 的仓库与 Projects 读取权限。工具不读取或打印 token。

```sh
node --experimental-strip-types tools/ts-checks/src/delivery/cli.ts \
  --config docs/engineering/github-delivery.json \
  --live \
  --save-capture tmp/<task>/capture.json \
  --report tmp/<task>/delivery-report.json
```

输出父目录须已存在。采集与报告可能含私有项目内容，应留在获准任务目录。工具仅查询配置仓库，不执行正文引用的命令或查询其他仓库。

## 阅读结果

先看 `completeness` 和采集错误，再看 `stock`、`cards` 与 `findings`。`declaredDecisions` 是评论声明。`acceptance:unknown` 表示有权者仍需核对权限、结果范围和撤销链。

`graph.cycles` 给出已知阶段等待环。空数组只表示已读子图未发现环。`delta.notComparable` 表示口径改变或读取不足，不能计为改善。

正常观察退出0。错误输入退出2。偏离不自动阻断交付。`enabled:false` 可以预备读取，但不能派发日常任务。正式配置保持未启用。长期产品与场景由[产品模块](../product/SPEC.md)独立发现；普通任务沿共同交付协议独立维护本次身份、范围和结果。平台启用、默认分支模板和实际宿主执行仍未由离线检查覆盖。

## 运行模块检查

```sh
pnpm --filter @omne-harness-lite/ts-checks exec vitest run \
  tests/delivery-observe.spec.ts tests/delivery-github-read.spec.ts
pnpm --filter @omne-harness-lite/ts-checks typecheck
```

平台边界依据 GitHub 官方的[Issue依赖API](https://docs.github.com/en/rest/issues/issue-dependencies)、[Issue API](https://docs.github.com/en/rest/issues/issues)及[GraphQL对象](https://docs.github.com/en/graphql/reference/objects)。实际远端读回仍以采集结果为准。

可选任务绑定和条件目标 scope 由 [binding.ts](binding.ts) 解析，供[集成工具](../integration/README.md)消费。旧六列表 scope 为 all；七列表最后一列是适用目标。阶段等待图尚未完整验证目标层细化，报告保留 uncovered。观察不检查 Git 是否真的达到 completionTarget，也不授发布权限。
