# Session 投影提供者验证边界

来源 [旧设计](../../../../packages/session/projection/design.md) 的 SHA-256 为 `57c09837e86dcd17dd4176b26454ca0b04f07560df41abcdf0d1d0579cf61828`；最近改动 commit `34251fdfdac400f4db32a2e2b62aa1578b887b04`。当前[源码入口](../../../../packages/session/projection/src/index.ts)和[package exports](../../../../packages/session/projection/package.json)只公开 `/baseline`；本页把实际源证据与目标 v1 缺口分开。

在 HUB 当前源码上执行 `pnpm --filter @omne-harness-lite/session-projection build` 成功，随后同包 `test` 得到 1 个测试文件、28/28 用例通过。它只覆盖下表列出的 baseline 行为，不覆盖新 v1 的联合装配。

| 采用性质/前提 | 实际源证据 | 新 v1 结论与剩余责任 |
|---|---|---|
| 纯 reducer、注册和本代撤回 | `SessionProjectionRegistry.register`/`stateOf`、`ctx.effect` disposer、[registry 测试](../../../../packages/session/projection/tests/projection-registry.spec.ts) | baseline 可演示同 key/版本登记和卸载；当前同版本重复登记按 refcount 共用首个函数，未证明 SE-10 对不同贡献的冲突拒绝 |
| 可丢弃缓存和重建 | `checkpoint`/`restoreFloor`/`restore`/`hydrate` 及 schema/version/缩短 log 测试 | 当前键与水位是内存 Session event seq，未绑定 DR/CC commitPosition、输入版本、授权版本及联合发布基线 |
| 订阅、快照、折叠水位 | `onChanged`/`snapshot` 和对应测试 | 当前是 raw view 与 `asOfSeq`；没有按原 commit batch 的 `completeTo/floor/changes/snapshot`、授权集合或有限查询适配 |
| Run driver 位置 | [Run driver 映射](../agent-run-driver/design.md)规定 `run.driver_position` | 当前没有按 RN-07 注册并以 Run 权威事实折叠的产品 reducer；缺席时 unavailable 尚待组合验证 |
| M disposition 与消息流消费 | [Session SE-03/10](../../spec/capabilities/session/v1/contract.md)和[MS-11/12/22](../../spec/capabilities/message-stream/v1/contract.md) | 无 closing.pending/unknown 的同水位 state update、授权完整 snapshot、hidden-only 跨越、客户端完整批安装证据 |
| 当前披露与撤权 | 旧设计要求 Session 当前读权，baseline registry 不提供该 resolver | 无 SE-20 受限查询实现；不能把 baseline wire view 暴露给普通用户 |

本次迁移只取得源码、来源、契约映射及 baseline 构建/单测证据。新 v1 的实现验收至少固定产品实现修订、真实 DR/CC/Session/Run/M/MessageStream 装配和以下反例：一批多事实/跨流引用、隐藏批无帧但 `coveredThrough` 前进、`to` 小于全局 `completeTo`、closing.pending 无 terminal、durable unknown 后修订、撤权与订阅竞争、缓存错 Session/版本/水位、缺 reducer 与旧 disposer、崩溃后前缀截回及旧 generation 晚到。每项记录实际输入、结果和限制后，才可把相应消费者从 blocked 推进；候选契约接受与源码测试通过本身不等于联合符合性。
