# 产品应用与装配入口

本树放产品应用。每个应用负责进程启动、命令行或配置的读取、装配、就绪与退出。可复用的业务行为归 `packages/`。应用目录不自动成为进程或微服务，一个目录存在也不表示它已经支持部署。

依赖方向以[包组织](../docs/package-organization.md)为准。部署与运行拓扑以[部署与运行拓扑](../docs/architecture/deployment/README.md)为准。

## 现有成员

| 成员 | 做什么 | 怎么构建和运行 | 怎么验证 |
| --- | --- | --- | --- |
| [`apps/cli`](cli/README.md) | `omne` 命令行客户端。打印帮助或版本，并经 SDK 向服务器发送六个操作：注册、登录、创建会话、发送输入、取消运行、停止调用。 | `pnpm --filter @omne-harness/cli... run build`，再运行 `node apps/cli/dist/bin.js --help` | `pnpm turbo run test --filter=@omne-harness/cli` |
| [`apps/harness-server`](harness-server/README.md) | Harness Server 的应用装配。用 Cordis 装载两层层叠的插件树，检查装载、可见性、就绪与有序关闭。`s0` 模式装载替身，`serve` 模式按正式服务键装载同一批行。 | `pnpm --filter @omne-harness/harness-server run build`，再运行 `node apps/harness-server/dist/bin.js s0 …` 或 `serve …` | `pnpm --filter @omne-harness/harness-server run test:fast` 与 `test:slow` |
| [`m2-contract-skeleton`](m2-contract-skeleton/README.md) | 私有验证应用。在一个进程内走首条租户路径的公开入口，逐跳报告 `verified`、`failed` 或具名缺口。不提供生产服务。 | `./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test` | 同上 |

三个成员的构建都要求 Node 24 或更高版本，都在仓库根的 workspace 内，不单独发布。

## 目标责任

| 装配角色 | 架构入口 | 成员状态 |
| --- | --- | --- |
| 客户端表现及系统接入 | [系统分层](../docs/architecture/layers-and-dependencies.md) | [`apps/cli`](cli/README.md) 已提供帮助、版本与六个命令。终端界面（pi-tui）尚未实现，输出在终端与管道上相同。 |
| 个人设备常驻 Harness Server 及多进程协作 | [单机部署](../docs/architecture/deployment/single-machine.md) | [`apps/harness-server`](harness-server/README.md) 提供 S0 装配骨架与 `serve` 模式。`serve` 下的行目前仍是替身，HTTP 入口由 `packages/access/server-entry` 的消费者接入。 |
| 云节点与集群装配 | [部署入口](../docs/architecture/deployment/README.md) | 尚未建立成员。 |

## 建立与维护

建立一个新应用之前，先确认它的应用规格与公开依赖，再建立真实成员。应用只拥有启动、配置、装配、就绪与退出，不复制可复用业务。每个成员在自己的 README 里写清用途、使用、配置与运行限制、契约与验证；成员首次出现时同时登记到本页。

改公开入口或退出码时，先改该成员的行为规格，再改本页的成员说明。改装配角色时，先改架构页，再改本页的目标责任表。应用被取代时，从本页删除它的行，不保留旧名字作为新成员的命名依据。

根目录的 `documentation.json` 把本页登记为必选的入口文档，要求「目标责任」与「建立与维护」两节。新增或删除小节时，同时改登记。

## 旧应用

已有的 CLI 与宿主实现保留在 [apps.0.0.1.legacy](../apps.0.0.1.legacy/README.md)。它们是封存实现和现有工具的依赖，不属于本树已完成的能力。
