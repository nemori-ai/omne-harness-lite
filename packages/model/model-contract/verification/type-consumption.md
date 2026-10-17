# Model 类型消费检查


类型消费检查须从本成员 [public-api](../docs/public-api.md) 、[model 实现入口](../../model/docs/public-api.md)及[Cordis 定义](../../model-cordis-contract/docs/public-api.md)的全部 TypeScript 代码块提取声明，按三个模块分别消费，不维护一份手工缩减的替代接口。检查使用仓库实际 operation-result、legal-identity、content-block、message、json-text 和 call-account 根类型，开启 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess 及 noEmit。

上述是设计声明的形状检查，不证明纯契约可独立安装。真实分包后从实际产物分别消费 model-contract、model-cordis-contract/cordis、model 和 model-host-local/cordis，沿[目标导出归属](../docs/public-api.md#导出归属与落地前置)核对工厂及构造类型。共同 `Outcome` 必须从 `@omne-harness/operation-result` 导入，并由生产依赖声明承接。该共享成员零依赖不代替 Model 完整安装闭包的验证。

新增负例须证明纯契约不能导入 executeModel/createModelRuntime 或 ModelConfiguration，Cordis 消费者不从具体插件取得 Service 定义；生成声明不得穿透实现源码。正例覆盖 adapter 只消费纯契约即可实现相应端口，以及消费者和实现共享同一品牌/Service 身份。其他实现不必采用 model 工厂的配置结构。

正例检查独立函数不需要原工作、托管受理/原查询/目录/读取/processed ACK 可以连接、提供者具有恢复入口。负例检查缺少租户、混用 instance 与 call、使用未验证操作字符串、普通消费者发布实例、裸 saved 布尔代替交接证据、伪造独立函数的托管身份参数和调用者越权访问 quiesce 均不能通过类型检查。对 `ModelCalls.cancel` 与 `ModelCommands.control` 传入 `reason` 字段，被多余属性检查拒绝，因为取消输入不携带原因。

这些正例使用声明的消费者持久完成函数，不实现它，不能据此声称其 DurableEvidence 为真。类型检查也不能证明不同 operation 的字符串不同、主体当前有权或附件已耐久；这些是运行边界与协议的验证责任。探针脚本与原始输出归任务 tmp，不是公开导出。

准备接口的正例包含求值、完整组装、prepare 和原 admit。负例覆盖估算缺余量、deferred-media 空引用、修订缺 expected、档案供应商夹带秘密、转换成功缺 transcript。编译文件清单不得出现 packages/tool；运行资格、摘要真实性和物理预算仍由实际边界验证。

物化消费正例连接 PreparedTransport.materialize 的回执与 ModelCommands.recordMaterialization。负例覆盖计量缺 limits、物化对象缺 receipt、default 参数伪造 requested。转换取消以具名 failure 返回，不依赖未声明的异常。

计量补充正例消费 count 的结果和失败、meter.basis、完整报告中的 counting，并分别构造块操作及累计快照。负例覆盖 tokenizer 不提供 encode、特殊段缺 name、预算缺 counting、以旧 output 形式交流事实，以及把完整快照塞入 delta。精确计数、统计口径与事件时序不由这些类型探针证明。

宿主与独立能力的正例连接 createModelProfiles、createModelRequestPreparation、createModelMessageConversion、createModelRuntime 和 host.bind(provider.driver)。ModelBindingFailure.conflict 必须不借业务 operation/revision 即可表达。负例覆盖普通 runtime 取得 driver、驱动缺 continuity、工厂缺注入依赖、转换缺来源核验依赖以及注册缺 authority。

pi 提供者候选另从[组设计](../../docs/architecture.md#pi-家族贡献的取得协议)提取目标贡献声明，验证固定供应商取得、物化表示、每次 decoder 与 finally 释放能连接。它不是领域契约的导出，也不是该目标包已经存在的证据。

诊断消费覆盖原 call 的授权输入、品牌游标及最小字段。漏租户/调用、普通字符串游标和把原请求 body 写入白名单记录须被拒绝。结构类型只约束公开声明，不防止不可信对象多带字段；运行边界须构造白名单投影并执行权限及内容校验。

身份与序列的正例使用根入口的品牌类型：每个品牌是 `Identity` 的一个键，`ModelIdentityKey` 列出十个品牌键，`ModelIdentityRejection<K>` 的 `field` 取品牌键，`reason` 是闭合的六个值。负例覆盖：普通字符串不能赋给任何品牌，一个品牌不能赋给另一个品牌，`Revision` 不能放到 `OutputCursor` 位置，导出类型名（例如 `'DispatchId'`）不是品牌键，不在列表内的 `reason` 与 `field` 被拒绝。这些是类型探针，能在声明阶段运行。

解码与比较函数的正例与负例在函数落地后加入：`decode*` 的成功值可放入 `Access`、`CallAccess` 与 `Mutation`，失败值的 `field` 与函数的品牌键一致，`compareRevisions` 与 `compareOutputCursors` 接受同类品牌。负例覆盖：向 `decodeModelCallId` 的成功值位置传 `DispatchId`，把 `OutputCursor` 传给 `compareRevisions`，把 `Revision` 传给 `compareOutputCursors`，没有 `compareResultVersions`、编码函数与相等函数。运行行为由测试覆盖，不由类型探针证明：每个品牌至少一个成功例与每个适用 `reason` 一例，比较覆盖相等、长度不同、等长不同文本，以及 `"10"` 对 `"9"`（防止按字典序误比），`ModelOperationId` 的主体以 `--` 开头时仍能解码。

消费者 owner 装配声明的正例：免守卫声明带 `evidence` 通过类型检查；`work.kind = 'guarded'` 的声明带 `participant`；`deriveGuardControlOperation` 的返回值作为 `ModelOperationId` 传给 `ModelCalls.cancel`（函数落地后加入）。负例：缺 `evidence`（免守卫也必须给出）、`work.kind` 拼写错误、`consumerOwner` 写成 `owner`、受守卫声明缺 `participant`，均被类型检查拒绝。`participant` 在资格参加者协议闭合前是暂定形状，协议改变它时，这些用例同步改。类型检查不证明同一 owner 不重复声明、受守卫 owner 构造失败或冻结行为，这些归提供者构造与组合验证。
