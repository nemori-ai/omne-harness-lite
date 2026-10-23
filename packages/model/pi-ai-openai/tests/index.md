# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试分层、替身与未迁入的封存测试
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的运行时导出
- [records.spec.ts](records.spec.ts)：记录的迁入事实、线数据与纯度
- [adoptions.spec.ts](adoptions.spec.ts)：采用指纹
- [family.spec.ts](family.spec.ts)：家族配置与取得
- [plan.spec.ts](plan.spec.ts)：参数规划与请求体
- [rules.spec.ts](rules.spec.ts)：四个 hook 的规则
- [meter.spec.ts](meter.spec.ts)：图片规则与计量
- [calibration.spec.ts](calibration.spec.ts)：经 `@omne-harness/model` 的真实准备租约与真实 `rules.plan` 的校准计量：锚点命中与不命中、带推理状态的单元按来源 O 估算、每种扣留原因、没有 lineage 时与此前逐字节相同
- [profiles.spec.ts](profiles.spec.ts)：官方档案与往返
- [fixtures.spec.ts](fixtures.spec.ts)：回放夹具与真实网关的流
- [cross-family-replay.spec.ts](cross-family-replay.spec.ts)：跨家族回放的 OpenAI 一侧
- [examples.spec.ts](examples.spec.ts)：慢层，`OMNE_LIVE_TESTS=1` 时运行示例
- `support/`：测试配置、构造函数、夹具用例表与两个脚本
- [fixtures/](fixtures/README.md)：指纹与回放夹具
