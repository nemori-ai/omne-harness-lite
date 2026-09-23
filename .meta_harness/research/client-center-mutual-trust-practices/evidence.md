# 可复核的来源与观察

抓取日期一律 2026-09-23；来源立场：E-1～E-3 是 IETF 标准原文，E-4～E-8 是厂商或项目官方文档（自述），本轮没有独立第三方来源。

## E-1 RFC 6750：持有型令牌的定义与缓解

- 消费对象：research.md「持有型令牌是终端用户 API 的通行做法」
- 来源与精确修订：<https://www.rfc-editor.org/rfc/rfc6750.html>（RFC 正式版不变）
- 取得方式：读 §1.2 与 §5.2
- 实际观察：§1.2 "Any party in possession of a bearer token (a 'bearer') can use it to get access to the associated resources."
  §5.2 "confidentiality protection MUST be applied using TLS with a ciphersuite that provides confidentiality and integrity protection"；
  "The client MUST validate the TLS certificate chain when making requests to protected resources"；
  "Client implementations MUST ensure that bearer tokens are not leaked to unintended parties"；
  "Token servers SHOULD issue short-lived (one hour or less) bearer tokens"；"Bearer tokens SHOULD NOT be passed in page URLs".
- 支持范围：Bearer 的风险模型与标准缓解；不支持任何关于泄漏概率的断言。

## E-2 RFC 9449：DPoP

- 消费对象：research.md「偷了令牌也用不了有两份标准」
- 来源与精确修订：<https://www.rfc-editor.org/rfc/rfc9449.html>
- 取得方式：读摘要与 §1
- 实际观察：摘要 "a mechanism for sender-constraining OAuth 2.0 tokens via a proof-of-possession mechanism on the application level"；
  §1 "The primary aim of DPoP is to prevent unauthorized or illegitimate parties from using leaked or stolen access tokens, by binding a token to a public key upon issuance and requiring that the client proves possession of the corresponding private key when using the token"；
  "a general defense in depth against the impact of unanticipated token leakage".
- 支持范围：应用层持有证明的标准存在及其目标；未读 §4 的 proof 形状。

## E-3 RFC 8705：双向 TLS 与证书绑定令牌

- 消费对象：research.md「偷了令牌也用不了」「双向 TLS 主要用于机器身份」
- 来源与精确修订：<https://www.rfc-editor.org/rfc/rfc8705.html>
- 取得方式：读摘要与 §1、§2
- 实际观察：摘要 "OAuth client authentication and certificate-bound access and refresh tokens using mutual Transport Layer Security (TLS) authentication with X.509 certificates"；
  "Binding an access token to the client's certificate prevents the use of stolen access tokens or replay of access tokens by unauthorized parties"；
  两种客户端认证："The PKI (public key infrastructure) method … adheres to the way in which X.509 certificates are traditionally used for authentication" 与 "intended to support client authentication using self-signed certificates".
- 支持范围：双向 TLS 在 OAuth 里是「客户端（程序）认证」；不支持关于普及率的断言。

## E-4 Kubernetes kubeconfig v1

- 消费对象：research.md 第一、二、四条结论
- 来源与精确修订：<https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/>（页面无版本 token；抓取日期见页首）
- 实际观察：`certificate-authority` "path to a cert file for the certificate authority"；`certificate-authority-data` "PEM-encoded certificate authority certificates"；
  `insecure-skip-tls-verify` "skips the validity check for the server's certificate. This will make your HTTPS connections insecure."；
  `tls-server-name` "used to check server certificate. If TLSServerName is empty, the hostname used to contact the server is used."；
  `client-certificate` "path to a client cert file for TLS"；`token` "the bearer token for authentication to the kubernetes cluster".
- 支持范围：一个主流自托管控制面的客户端配置面；不支持其内部实现细节。

## E-5 HashiCorp Vault CLI 环境变量

- 消费对象：同 E-4
- 来源与精确修订：<https://developer.hashicorp.com/vault/docs/commands#environment-variables>（页面无版本 token）
- 实际观察：`VAULT_CACERT` "Path to a PEM-encoded CA certificate file on the local disk. Used to verify SSL certificates for the server."；
  `VAULT_SKIP_VERIFY` "Allow communication between the CLI and Vault server before verifying the authentication certificate presented by Vault."；
  `VAULT_TOKEN` "A Vault-issued service token that authenticates the CLI user to Vault."；`VAULT_TLS_SERVER_NAME` "Name of the SNI host for TLS handshake resolution".
- 支持范围：同 E-4。

## E-6 OpenSSH `ssh_config(5)`：记住指纹

- 消费对象：research.md 第一条结论
- 来源与精确修订：<https://man.openbsd.org/ssh_config.5>（OpenBSD 当前手册页）
- 实际观察：`StrictHostKeyChecking` 默认 `ask`："new host keys will be added to the user known host files only after the user has confirmed that is what they really want to do, and ssh will refuse to connect to hosts whose host key has changed"；
  `accept-new` "will automatically add new host keys … but will not permit connections to hosts with changed host keys"；`no` 才允许指纹变了照连。
- 支持范围：TOFU 的参考实现及其默认值。

## E-7 Syncthing 设备 ID

- 消费对象：research.md 第一条结论
- 来源与精确修订：<https://docs.syncthing.net/dev/device-ids.html>
- 实际观察："The device ID is a direct property of the public key in use"；ID 取 "the SHA-256 hash of the certificate data in DER form" 再 base32；
  握手时 "Calculate the remote device ID by processing the received certificate as above" 并 "Verify the remote device ID against the configuration".
- 支持范围：双向记指纹的参考实现。

## E-8 PostgreSQL 16 libpq `sslmode`

- 消费对象：research.md 第一条结论
- 来源与精确修订：<https://www.postgresql.org/docs/16/libpq-ssl.html>
- 实际观察：表 34.1：`require` 防窃听、不防中间人，语句 "I trust that the network will make sure I always connect to the server I want"；`verify-ca` 防中间人「取决于 CA 政策」；`verify-full` 两者都防。
  "The default value for sslmode is prefer."；"If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA. In this case, verify-full should always be used."
- 支持范围：一个成熟客户端库对「加密 ≠ 身份」的明文区分；`prefer` 默认不防中间人是它自己承认的边界。

## E-9 RFC 9110 §7.4（本轮顺手核，供传输绑定 S-33）

- 消费对象：传输绑定契约 S-33 的 §7.4 偏离行
- 来源与精确修订：<https://www.rfc-editor.org/rfc/rfc9110.txt>
- 实际观察："Unless the connection is from a trusted gateway, an origin server MUST reject a request if any scheme-specific requirements for the target URI are not met. In particular, a request for an 'https' resource MUST be rejected unless it has been received over a connection that has been secured via a certificate valid for that target URI's origin".
- 支持范围：这条义务在源服务器一侧。
