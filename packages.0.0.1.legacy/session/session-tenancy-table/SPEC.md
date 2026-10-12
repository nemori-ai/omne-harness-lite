# 会话目录维护边界

本页约束新增的 `./maintenance` 读口及 seed 的创建结果。现有 holdingTenant、
seed 权限边界和不可变映射的承诺仍按原接受依据维护。

STC-1：readSessionCatalogIn 使用调用方提供的 ReadTx，返回全部持有关系。
每行必须通过现行 SessionRef 和 TenantId 校验。重复会话、坏行或读取失败不得被跳过，
也不得返回部分目录。空目录可返回空数组。

STC-2：此入口只供可信应用 owner 做完整恢复扫描及提供者验证。
它不在根入口、seed 或 Cordis 会话查询服务转导出，不获取写事务或关闭权。
它返回持有范围，不授予用户访问权限；普通操作仍须核对当前租户和会话授权。

STC-3：seedHoldingTenant 返回 created，仅表示本次调用在给定写事务中插入了新行。
alreadyPresent 表示相同持有关系已存在。两者都不替代外层事务提交确认。
此前观察到 sessionNotFound 不能证明本次取得新建责任；其他租户的既有映射仍拒绝。
采用依据为本期 ic6.1 选择复核，不为普通查询服务增加写口。
