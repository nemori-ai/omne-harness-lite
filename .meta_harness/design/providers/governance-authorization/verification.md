# Authorization 提供者验证边界

来源设计固定为 `packages/governance/authorization/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `81c6cbf30bacb47f131791717fc89ce9c0684055ab2474b80de62cd10db1fd87`）。当前结论：目标包、host、插件及公开源码尚未实现；当前只有被接受为施工输入的提供者设计。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。
