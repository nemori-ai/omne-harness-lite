# MP6 精确 Schema 资源增补

2026-09-29，candidate，未采用、未实现验收、新增绑定 0。既有 `packages/core/model-profile` 仍为纯数据模块；本次只提供 MS7 新 created 内容精确引用所需的资源，接续 [现行 MP5](v5-current-design.md)，不迁移根执行语义。

## 差异与消费路径

[data.model-profile/v6](../../../../spec/data/model-profile/v6/contract.md)已由 D-101 采用。与 MP5 Schema 的独立 JSON 比较结果：仅 `$id`、`title`、`description` 不同；其余全部成员包括 `$defs` 完全相同。MP6 §十二及“v6 最小采用边界”明确只改变 S-8/S-33 的发送前 token 准入保证，不改变字段、Schema 断言、S-18/S-24/S-25/S-33 纯值数值判断或 S-27 快照原值。

因此当前目录取得的 MP5 完整档案/快照，按照原 S-27 无损完整复制后，可由 MS7 created 所引用的 MP6 Snapshot 定义判形，**不转换、不补字段、不改绑定、cap 或原采用来源**。MS7 created 的来源版本由 RT11 按实际采用链记录，不能因数据同形伪造目录曾以 MP6 实施。RT11 当前发送门另明确采用 MP6 S-8/S-33：有依据估算及显式余量的准入保证不能由纯 Schema 成功替代。

消费路径为当前 directory5/MP5 读取 → runtime 完整副本 → MS7 created 的 MP6 精确 Schema；原 dispatched/MS6/LC6 与 MR10 响应快照仍取各自冻结的 MP5 资源。两 URI 同时注册且资源各自原字节不变，不把 MP6 URI 重定向到 MP5 JSON。

## 公开面与 Cordis 投影

| 责任 | 具体增量 | 验证 |
|---|---|---|
| MS7 S-53 精确 MP6 Snapshot 与封闭资源图 | 包发布 `./schema/v6` 指向规范原字节 MP6 JSON；源码无新 judge/函数/类型路由 | MP6-R1 |
| 当前 MP5 及其消费者 | root 和 `./schema` 继续现行 MP5；不新增 schema/v5 别名或旧执行入口 | MP6-R2 |
| 当前快照完整性与接收边界 | 现行纯值和 strict/lossless 原语保持；不得通过 JSON.parse/字段白名单舍弃原成员 | MP6-R3 |

本包没有 Cordis 服务、Context、fiber、注册或动态持久对象；本次不增加上游 API 主张。存储要求 0，装载/撤除效应 0，租户权限/生命周期由消费方拥有。资源随包静态发布，缺精确资源或编译失败在初始化报错，不访问网络 resolver 或换版本。现行依赖所需规范资源的保留不是旧格式运行兼容。

## 选择、迁移与验收义务

选择最小原字节资源出口：相比把 root 升 MP6 并让全部旧引用改路径，此增量不改变现行 MP5 消费面，代价是两个明确 Schema 身份并存。弱点是消费者可能误把同形当语义同源，因此双资源测试与 runtime 源链检查均为必需；若未来两版本字段/纯值规则分歧，本结论失效，应重新明确映射，不能自动沿用。

| 编号 | 必须执行的验收 |
|---|---|
| MP6-R1 | 真正 pack 后外部消费者导入 `./schema/v6`，逐字节核规范摘要，`$id` 为 v6；删掉出口或替成 MP5 必须使测试失败；MS7/MR10 全闭包实际编译 |
| MP6-R2 | 同制品 MP5 `./schema` 与 MP6 `./schema/v6` 并存，全部 defs 对照相等；各规范正反快照实例分别经两个精确定义得到同一形状结论；不以 root Schema（仅defs）空验证替代 |
| MP6-R3 | 当前公开 MP5 判断取得完整快照，经 runtime 冻结与MS7创建内容往返，cap、adaptation和超2^53数值精确保留；token estimate/余量仍由RT发送门另验，纯资源不发网络 |
| MP6-R4 | README/README_ZH 说明 root MP5 与精确MP6资源用途及可运行导入示例；无新增旧运行判断或隐式版本选择 |

本节点不改变 accepted 契约或目录，不增加产品参数，不要求完整 Session/Run。缺口为本候选技术采用、原字节资源发布与上述制品/消费证据；联合评审与主线接受之前不释放实现。

## 当前采用范围

仅新增 MP6 精确 Schema 资源供 MS7 created Snapshot 可达子图；model-profile root 继续 MP5，不改纯值判断/完整副本，不把 MP6 Schema 接收冒充 directory 已迁 MP6；发前 token 语义归 runtime。

技术采用不表示实现或实际验证已完成。验证义务：各节点当前关联验证义务；runtime R20-V1..R20-V23；SQL/JSONL 分域、unknown 留责、真实停止与来源当前性；正式包制品与全部受影响消费者。
范围之外：ACK 之后永久保管/noGC：已被 ACK 后继取代；完整 Session/Run/Agent/通用 registry 或内容平台。
