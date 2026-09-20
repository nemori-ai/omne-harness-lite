# 官方来源与观察

取证日 2026-09-16。以下是官方资料所支持的事实；动态文档在正式选型时必须绑定采用版本重新核对。

| ID | 来源及修订 | 实际观察 | 支持范围与局限 |
|---|---|---|---|
| E1 | [Claude Code 认证](https://code.claude.com/docs/en/team)、[快速开始](https://code.claude.com/docs/en/quickstart)，网页 2026-09-16 | `/login` 可重登/切换账号，`/logout` 退出；macOS 用 Keychain、Linux 凭据文件权限 0600。 | 证明 CLI 用户旅程和本地保管方式的实例；不证明它提供注册或多账号同时留存。 |
| E2 | [Codex app-server auth 文档](https://github.com/openai/codex/blob/50d77959bf927293c4b5ddcca81d05331ae582ea/codex-rs/app-server/README.md) | `account/login/start` 支持浏览器、设备码及 API key；`account/read`、`account/logout` 和完成/状态通知分离登录尝试与已登录状态。 | 固定源码文档可复核该修订的接口；登录目标为已有 ChatGPT/API 身份，不能推导我方注册语义。 |
| E3 | [DSH client connection](https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/packages/client/connection/README.md)、[provider 指南](https://github.com/deepseek-ai/deepseek-harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/docs/user/guide/providers.md) | 进程启动 token 换绑定本机 authority 的签名 cookie；文档明确无 logout 操作；模型供应商 key 另存凭据库。 | 只说明本地浏览器请求信任与供应商密钥；不支持自然人账号认证。 |
| E4 | [Better Auth options](https://better-auth.com/docs/reference/options)、[基本用法](https://better-auth.com/docs/basic-usage)，网页 2026-09-16 | 邮箱密码注册/登录、`disableSignUp`、邮箱验证、密码重置等配置可用。 | 展示可复用能力；邀请政策、注册唯一性与我方 `UserRef` 映射仍需设计和验证。 |
| E5 | [Better Auth session](https://better-auth.com/docs/concepts/session-management)、[SQLite adapter](https://better-auth.com/docs/adapters/sqlite)，网页 2026-09-16 | 数据库 session 有过期与当前/指定/全部会话撤销；SQLite 支持多驱动及 schema migration。会话文档的 Session Caching 段明确：启用 cookie cache 后，其他设备的已撤销会话可能直到 `maxAge` 才失效；可关闭缓存或对敏感操作跳过缓存。 | 证明提供者有相关机制与缓存边界；实际旧 token/缓存 cookie 的拒绝时点必须按采用配置实测，不从撤销 API 推断即时失效。 |
| E6 | [Better Auth device authorization](https://better-auth.com/docs/plugins/device-authorization)、[RFC 8628](https://www.rfc-editor.org/rfc/rfc8628.html)，网页/标准 2026-09-16 | 首方设备授权返回 Better Auth session token；注册的 CLI 公共客户端调用 API 时应走 OAuth device authorization，取得限定受众 access token，可按需安全保管 refresh token。 | 可选 CLI 机制，尚未决定本地 CLI 是否需要浏览器/HTTP 服务；不能将两种 token 混用。 |
| E7 | [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/)、[支持配置](https://www.keycloak.org/server/supported-configurations)，网页 2026-09-16 | 提供用户自助注册开关、登录、账号管理、会话和 token 管理；作为独立服务器运行。 | 证明真实独立 IdP 候选，不能由此得出本产品单机部署的成本或离线可行性。 |

未执行库安装、登录、迁移、故障注入或性能试验。本记录不以文档例子代替运行证据。已有任务级调查见 HUB `tmp/cli-account-auth-reuse-research.md`；本包保存持续消费的官方来源与限制。
