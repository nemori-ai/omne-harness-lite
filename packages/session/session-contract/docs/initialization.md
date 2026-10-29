# 初始化实现与提供者接线

行为唯一源为 [初始化来源与提交](../SPEC.md#初始化来源与提交)。当前纯核心实现来源计划、严格守卫解析、同批成功事实、原结果认回及 revision 3 重建。真实采用源、加载器、Context 的准备与提交应用、耐久存储仍由提供者兑现。

## 守卫和提交

`SessionEvidenceBridge.prepare` 保持原签名。初始化材料使用根入口导出的 `INITIALIZATION_PROTOCOL`，精确形状见 `InitializationGuardFacts`、`InitialAdoption`、`InitializationGuardResult`。桥核验真实来源、完整要求及当前资格；存储参加者只接受自己登记的协议和可信来源。

`decide` 校验封闭结构、完整命令、原创建身份、原项协议和输入，以及结果与必要成功事实的关系。它不调用 Context，也不把 JSON、candidate 或结构合法的证据当成来源凭据。当前资格必须在原操作认回之前重核。

`DecideReads.initializationReceipts` 是可选的、同一事务根上的原回执清单。首次结果不依赖它。认回已有同值结果时，必须找到匹配原 operation、revision 和完整批次范围的回执，否则返回 `unavailable`。该清单由可信存储读取；调用方不得自行组装。结果保留原 operation，不换成本次重试身份。

初始化状态保存在 `WorkSnapshot.initialization`：原协议、计划、初始采用、完整输入、结果索引及注册决定。该字段可选以保留已有公开类型消费者。当前解释器的成功创建必定填充它。任一原项未 ready（包括 failed）时仍为 initializing。原 workspace-load 项未 ready 时，`change(workspace)` 返回 `invalid`，保留原工作区及附着。`startRun` 和 `freeze` 返回 `not-ready`。

SE01、初始 SE08、首次 SE36，以及结果对应的 SE07、SE08、SE36、SE02 使用一批提交。归约先验证精确解释采用，再重建原命令并核对完整事实和引用，验证完成才返回新快照。注册按原来源顺序维护临时修订链。提交之后的 Context `applyCommit` 由适配器按原决定重放，不属于纯准备。

同一原 scope 中若出现未被初始化注册决定覆盖的旧形状 SE07，当前保存材料没有完整 RegistrationRevision。普通 `change(context-registration)` 仍然成立；该条件下新的初始化注册 ready 返回 `unavailable`，不以事实条数猜修订。无关 scope、无关声明与原已提交同值结果的回执认回不受此缺依据路径影响。

## 测试来源

`./testing` 的 `createMemoryInitializationSource` 需要通过测试控制面显式登记事实。`adoptedInitializationFixture` 表示测试已给定的实际采用前提；它不属于生产入口，也不是生产准入默认值。来源对发出的材料记录对象身份、完整内容和命令绑定，并在提交前重核资格。复制 JSON、篡改已发材料或跨命令复用均被拒绝。

把同一个来源交给 `createMemorySessionEvidenceBridge({ initialization })` 与 `createMemorySessionTransactions({ initialization })`。没有配置来源的初始化请求返回 `invalid`。内存事务替身在单根发布点一起替换日志、快照、结果索引和操作答案。故障注入只验证这个内存边界，不证明持久化或跨进程原子性。

`failNextInitializationCommit` 在发布前返回 `unavailable`，不写入事实。`loseNextInitializationReply` 在发布后返回携带原操作身份的 `commit-unknown`。调用方可查询原操作或以原输入重试。认回仍须通过当前来源资格核验。

## 精确发布摘要

初始化协议 revision 1 和日志解释器 revision 3 均绑定当前生产源码集合的 SHA-256。摘要输入是本包 `src/` 下所有 `.ts` 文件，递归枚举并按包内相对路径的 UTF-16 顺序排序。排除相对路径以 `testing` 开头的测试入口与替身，以及仅保存两个常量的 `src/release-digests.ts`。排除文件不得承载生产行为。

每个文件依次输入：路径 UTF-8 字节数的十进制 ASCII 文本、冒号、以 `src/` 开头的相对路径 UTF-8 字节、文件字节数的十进制 ASCII 文本、冒号、原始文件字节。文件集合和路径也是摘要内容。没有时间、环境变量或绝对路径。运行时只读取编译后的常量，不读文件系统。

在仓库根执行以下命令，须在源码格式化后运行：

```sh
node packages/session/session-contract/docs/recompute-release.mjs --write
```

[protocol-release.spec.ts](../tests/protocol-release.spec.ts) 独立枚举完整集合、重算字节摘要，并检查被排除的常量文件没有行为。同 revision 不同 digest 是不同精确采用。当前解释器只支持当前精确 revision 3；其他采用以版本不兼容隔离，保留原日志，不以新字段要求判旧历史畸形，不自动回填或重新 create。

## 验证导航

- [initialization-plan.spec.ts](../tests/initialization-plan.spec.ts)：唯一身份、归一化和 UTF-16/JSON 编码向量。
- [initialization-behavior.spec.ts](../tests/initialization-behavior.spec.ts)：非空来源、多注册、失败接续、原回执、采用与原子发布。
- [initialization-integrity.spec.ts](../tests/initialization-integrity.spec.ts)：跨边界绑定、未知字段、篡改、资格及历史隔离。

真实提供者、真实 Context replay、Model ACK、新 scope 业务初始化及跨进程恢复保持 SPEC 的既有边界。
