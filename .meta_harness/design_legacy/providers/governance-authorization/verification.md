# Authorization 提供者验证边界

来源设计固定为 `packages/governance/authorization/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `81c6cbf30bacb47f131791717fc89ce9c0684055ab2474b80de62cd10db1fd87`）。当前结论：目标包、host、插件及公开源码尚未实现；当前只有被接受为施工输入的提供者设计。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。

另须以两个真实账号和两个不同 Agent 定义复核设置与 grant 作用域：切换组织不复制
账号覆盖，共用 Plugin 不转借 Agent 的 grant；SR/MC 保存模型覆盖但当前 Run 不被
改写，解析器/Binding/资源来源换代后旧预览不可准入。grant/amend/revoke 及 HD
合法作答须覆盖资源 owner 的逐项 `mayPerform`/`mayDelegate`、撤权后重检、来源失联
和恢复，且只能在统一 grantor 权威表示获裁决并具备真实来源后验收；旧双字段或
仅凭 TG 管理角色不能抵扣。
