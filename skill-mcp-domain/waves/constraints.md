# 两条线共用的约束（会话级）

格式沿 `claim` 的 spec 模板「原则与约束」。本文件会话级维护，各波 `spec.md` 只写差额并引用本文件。

## ub-mode

按 ub-mode 全文。本会话有取舍的条目：

| ub-mode 条目 | 取舍与理由 |
| --- | --- |
| First Make it Work | 每个闭包先让公开入口的端到端行为可测，再整理结构 |
| TDD | 新测试先确认变红再实现；纯函数穷举，服务按行为断言 |
| 少即是多 | 不为未来波段预留空接口或空实现；第一波之后的操作只写接口，不写占位实现 |

## 项目独有判断

| 判断或约束 | 拥有者 | 条目 |
| --- | --- | --- |
| 问题所在的轴与拥有者 | `.meta_harness/agents/roles/engineering-taste.md`「维度分解与正交」 | Skill：方法与资源取用；MCP：接入点、连接、发现与动作。两条轴互不决定。资产治理、读取权、使用资格、凭据、进程落点都在轴外，只经需求端口进入 |
| 领域边界与依赖方向 | `docs/architecture/layers-and-dependencies.md` | 两个契约成员只依赖 `assets` 与公共值成员；不依赖 Cordis、Tool、Session、Agent、执行环境或任何调用方的成员 |
| 面向契约 | 成员 SPEC；`docs/engineering/integration.md`「可加改动」 | 契约成员合入父分支后只做可加改动（[范式 r1 §2 第 10 条](operating-model.md#2-照守的规则)） |
| 防御与失败语义 | `docs/defensive-patterns.md` | 错误不静默变成功；`unknown` 不压成拒绝、空集合或成功；对无权主体不披露身份是否存在 |
| 演进政策 | `docs/engineering/publication.md`「当前演进与消费者」 | 0.x：消费者同波迁移，删除替代实现，不做兼容过渡 |
| 仓库风格 | 组页设计守则 G7 | 接口 + 纯函数 + 判别联合；类只给有状态的内存聚合；依赖用对象参数注入 |
| TypeScript | `pstack:typescript-best-practices` | 品牌类型只由校验函数授予；判别联合 + 穷尽检查；外部数据 `unknown` 起步；不用 `any`；`as` 只出现在校验之后 |
| 只用自己的词 | 组页设计守则 G2 | 契约与 SPEC 不点名调用方；端口实现方只写在领域页 |
