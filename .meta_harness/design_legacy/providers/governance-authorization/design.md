# Authorization 提供者设计映射

消费 `capability.action-authorization@1`，并固定 S 的 `data.core-work@1`、`capability.durable-records@1`、
`composition.core-work-coordination@1` 与 `capability.engineering-observation@1` 所需条款。
旧 `f98ac926`/`058c77c` 接受只说明 legacy 施工来源，不接受本 baseline 坐标或候选插件。
状态转移、失败语义与重载细节见[当前协议](protocol.md)，其内容同样保持 candidate。

## 实现路径与来源

来源 `packages/governance/authorization/design.md`（SHA-256 `81c6cbf30bacb47f131791717fc89ce9c0684055ab2474b80de62cd10db1fd87`）在 legacy 仓库已区分现有实现和目标设计；本包只提取
持续映射，不把源设计状态提升为当前实现符合。目标包、host、插件及公开源码尚未实现；当前只有被接受为施工输入的提供者设计。


## 能力到 Cordis 的候选投影

| 契约责任 | 候选公开面 | 当前事实与缺口 |
|---|---|---|
| AU-01～AU-02 | `createAuthorizationHost`、设置/grant 管理 | 设置作用域与双定义映射见[当前协议](protocol.md#设置归属与两种定义)；grantor 的统一权威表示尚未裁决，grant/amend/revoke 不能凭旧字段开放；无实现或真实恢复证据 |
| AU-03～AU-06 | `AuthorizationPlugin` / `omneAuthorization`、具名 Session/Action/resource/decision fact links | service key 和 link 协议为候选；没有实际注册、判定或组合运行 |

## 权限见证、撤权与 TOCTOU

每次判定冻结同一 Action，并保存主体、tenant、membership/委托、subject definition、tool definition、
binding、环境、资源、grant、模式与一次决定的精确修订见证。prepare 只取得私有候选；共同短门
重读全部事实和 provider generation，任何变化返回 prepare_again/deny/unavailable，不能把预览
allow、缓存 TTL、Fiber ACTIVE 或声明 `confirmation=none` 当执行许可。

撤权在 logical 位置立即封闭之后的准入；正向 grant 只有耐久并 publication-ready 后可用。一次
决定只补原 Action 的可授予缺口且只能消费一次，不能越过 hard deny 或已生效撤权。来源撤除先
封闭新判定，保留未消费决定、原判定审计和 pending/unknown；旧 facade/候选不追随新代。


## 依赖与共同门

提供者实际组合依赖固定为：ARI-1/ARI-2/ARI-4/ARI-5；CD-01/CD-02/CD-04；DR-01～DR-05；CC-02/CC-03/CC-04/CC-05/CC-06/CC-07；OB-01～OB-03。其中 DR、OB 与 F 身份是提供者实现依赖，
不因此成为语言契约的新依赖；catalog 仍只保留原 G→CD/CC 六条语义依赖。

| 输入 | 使用范围 | 缺席/换代 |
|---|---|---|
| 列出的 ARI/CD 条款 | 稳定身份、tenant、因果、冻结输入 | 结构有效不代表当前资格；不补造身份 |
| 列出的 DR 条款 | 原操作、耐久回执、恢复/unknown、writer 换代 | 未核实写入保持 unknown，不能换 key 重试 |
| 列出的 CC 条款 | prepare、同门检查、共同提交、publication 与恢复 | blocked/unknown 不执行效果；通知不是状态权威 |
| 列出的 OB 条款 | 关联、拒绝/unknown 与 gap | 普通诊断失败不改业务事实；关键审计失败在效果前 fail closed |

具体 Cordis API 和生命周期仍须在采用版本核对；这里不声称候选 service/plugin 已存在。
