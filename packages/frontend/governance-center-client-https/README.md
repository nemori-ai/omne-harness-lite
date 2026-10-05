# governance-center-client-https

Node24 的治理中心协议客户端；提供公开 health 请求与 EC2/HT2 治理请求。
行为、资源所有权与采用范围见[SPEC](SPEC.md)。

```ts
import { readPublicHealth } from '@omne-harness-lite/governance-center-client-https'

const outcome = await readPublicHealth({
  url: 'https://governance.example.internal:8443/',
  trust: { mode: 'ca', certificateAuthorities: caPem },
  signal: abortController.signal,
})
```

默认使用系统 CA 与 URL 主机名；显式 CA 内容在调用开始时复制。SPKI 模式要求调用方已确认的64位十六进制 SHA256：`{ mode: 'spki', sha256: confirmedPin }`。没有 insecure、代理、重定向、自动重试或登录材料参数。

结果分别为 `health`、`entry-answer`、`unavailable`；只有 health 携带已校验的原三字段。`reachable` 不代表治理业务就绪。非法本地配置抛 `GovernanceClientConfigurationError`；异常程序缺陷不伪装成成功。

默认总期限10秒（可配置1～120000ms），头部16KiB、体64KiB。取消和超限得到明确 unavailable；调用返回前关闭本调用网络资源并清理订阅。Node系统DNS工作不一定随取消停止，不能据此保证进程即时退出。

```sh
pnpm --filter @omne-harness-lite/governance-center-client-https build
pnpm --filter @omne-harness-lite/governance-center-client-https typecheck
pnpm --filter @omne-harness-lite/governance-center-client-https test
```

测试用 openssl 生成临时证书并运行回环 TLS 对端；不访问外部中心或真实账号。本包不提供 CLI 命令或本地登录存储。

`exchangeGovernance(options, envelope)`发送一个EC2信封，返回`reply`、`entry-answer`或`unavailable`，另含目标是否可能发送的`sendAttempted`；不自动重试。登录成功的原始reply含秘密，只供共享用例层保存，不能直接作为终端输出。完整用例由[governance-client-operations](../governance-client-operations-local/README.md)消费本包。

公共类型和错误由 `@omne-harness-lite/governance-center-entry-https-json` 拥有。
`createGovernanceTransport()` 创建可关闭实例；它只等待通过自身准入的请求，关闭不影响独立函数或其他实例。
正式绑定从本包 `./cordis` 导入。
