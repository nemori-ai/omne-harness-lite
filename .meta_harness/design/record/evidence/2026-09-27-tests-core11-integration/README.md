# PR11 与治理工作线的实际整合检查 · 2026-09-27

输入是本支 `7b755ac65f63208f0362288f5dad40318b109ec3` 合入上游 `d4eaf7673bc161bf22f6682385151e080d3323ae` 的工作内容，协调采用见 [D-070](../../decisions/core11-integration-coordination/decision.md)。源码及工具输入逐文件 hash 归 raw 中 source-manifest.json（1012件），环境与两侧提交归 configuration.json；不是两侧旧测试结果相加。

[原始运行包](raw.tar.gz) SHA256 `d5228286be99bd3a58211cfacc1b1538c6f0397ded48257d73dcd4df9f4d9e45`，19件输入/日志的[逐件摘要](files.sha256.json)。主线在 macOS arm64、Node24.21.0、pnpm10.28.1 执行并复核；没有在该运行执行正式模型检查、Docker 最终制品或公司真实网络。

## 结果与实际失败

- 冻结安装、全 workspace build/typecheck、27条规则扫描、格式检查通过；格式工具按修正临时路径通过；Python176项通过。
- 首轮递归35成员测试在治理入口遇到 macOS `127.0.0.2` 无法 bind：522 passed／1 failed／2 skipped，后续成员未全部调度。保留 core11-tests.log；未把该命令写成成功。
- 核当前实际接口地址后，以 OpenSSL3.6.3 与 `OMNE_TEST_ALTERNATE_SOURCE_ADDRESS=10.18.100.75` 重跑失败治理入口及未执行的4个成员。core11-tests-remaining.log 五成员成功；按每成员最新一次计，共35成员 **8114 passed、34 skipped、0 failed**，细目 core11-test-counts.json。没有累加同一成员失败轮的522项。
- 安装最初暴露合并锁文件重复 CB importer，取上游完整锁后离线缺固定 yaml2.9.1，再按冻结锁补下载成功；三轮日志都保留，不改版本。生成角色检查最初遇到旧本地生成物，按当前 canonical 编译刷新后通过，两份日志保留。
- format 工具首轮用 macOS 默认 `/var/folders` 的逻辑路径，installer 与 Git 返回的 `/private/var/folders` 物理路径做字符串比较而 exit2。独立只读调查在两个隔离仓库重现该区别，两个脚本与上游和合并基点相同；本轮用既定物理 `TMPDIR=/private/tmp` 原样重跑成功，没有修改 installer 或放宽断言。
- docs 与设计内部检查通过；后者仅登记级 formal=registered。354份当前冻结资源逐件核验，原319份不变；D-070 精确映射和旧记录由独立评审核对。日志不等于任意运行环境的形式证明。

## 结论边界

这支持当前整合内容在上述环境的构建、类型与既有回归一致性，主线接受合入工作线。34项 skip 不变成覆盖；实际公司DNS/TLS、原生Linux硬件、最终Docker停止/故障验收与Agent端到端未在本运行验证。上游独立验收、本支旧CB2的195项及旧QA各自保留原输入；本运行不重新标记它们。Fable 的最终里程碑整体评审仍须另行执行。
