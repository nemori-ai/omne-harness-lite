# Agent 契约验证责任

## 性质与前提

声明判断、输出判断、身份解码与结构判定、正文契约按公共 SPEC 拒绝非法输入，不执行输入中的函数或访问器，不在导入时创建 runtime 或 schema 缓存。校验资源在调用范围释放，消费者只需本包及其纯依赖。

## 命令与证据拥有者

持续可执行验证由 [成员测试](../tests/README.md) 拥有，在仓库根运行 `pnpm turbo run test --filter=@omne-harness/agent-contract`，在成员目录运行 `pnpm typecheck`。资产和装配消费者分别验证自己的公开入口使用。单次执行记录留任务临时目录，不在本页保存运行快照。

## 未覆盖

运行契约、跨域围栏、持久化、实例换代及 Cordis 动态装配不由本包的验证单独证明。形式模型目录有 Journal 收尾协议的有界模型。它的规模上限、映射与未覆盖范围见 [formal-mapping.md](formal-mapping.md)，运行记录见 [formal-runs.md](formal-runs.md)。有限模型检查不是证明。[局部证明](proofs/README.md)只覆盖输入读取和节点失败输入保管，不授予整个 Agent 的活性或组合接受。
