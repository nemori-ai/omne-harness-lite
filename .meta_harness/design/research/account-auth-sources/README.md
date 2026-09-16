# 产品账号认证与 CLI 登录的复用来源

本研究核对成熟认证机制能否承接 [PF-026](../../requirements/product/PF-026-account-journey-and-isolation/README.md)，供[账号身份提案](../../proposals/account-identity/README.md)持续消费。结论是：账号注册、密码/其他认证方式、会话存储与撤销已有成熟提供者；本项目仍需拥有 `UserRef` 到个人租户、成员及个人配额的组合语义。

- 调查日期：2026-09-16。Claude Code、Better Auth、Keycloak 官方页面按当日可见正文；Codex 固定 `50d77959bf927293c4b5ddcca81d05331ae582ea`，DSH 固定 `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`。动态页面不能代替最终依赖版本验收。
- 消费者：PF-026 的能力边界、提供者选择、CLI 装配与后续 spike。
- 状态：来源研究；无提供者采用决定，也没有执行组合 spike。

## 准入核对

这组来源会持续用于账号提案和将来的提供者验证。每项官方来源、取证日期、支持范围和局限见[证据记录](evidence.md)；结论与待验证前提见[研究正文](research.md)。
