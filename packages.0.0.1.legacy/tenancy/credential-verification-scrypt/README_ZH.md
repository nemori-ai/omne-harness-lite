# @omne-harness-lite/credential-verification-scrypt

[English](README.md)

基于 Node scrypt 的密码凭据提供者。它通过公共凭据接口公开解析、派生、验证与可配置密码政策检查。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/credential-verification-scrypt": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                       | 用途                       |
| -------------------------------------------------------------------------- | -------------------------- |
| `createPasswordCredentials`, `parseCredential`                             | 独立凭据服务与表示层解析   |
| `CredentialVerificationConfig`, `ScryptParameters`, `DerivationParameters` | 严格派生配置与参数类型     |
| `PASSWORD_SCRYPT_SCHEME`                                                   | 凭据材料编码的方案标识     |
| `PasswordPolicy`, `CHARACTER_CLASSES`, `CharacterClass`                    | 密码政策 Schema 与字符类别 |
| `./cordis`: `credentialsPlugin`, `managedCredentialsPlugin`                | 独立与装配管理绑定         |

## 示例

```ts
import assert from 'node:assert/strict'
import { isOk } from '@omne-harness-lite/identity-values'
import {
  createPasswordCredentials,
  CredentialVerificationConfig,
} from '@omne-harness-lite/credential-verification-scrypt'

const credentials = createPasswordCredentials(CredentialVerificationConfig.parse({}))
const parsed = credentials.parse('documentation-example')
assert.ok(isOk(parsed))
const material = await credentials.derive(parsed.ok)
if (material === 'unavailable') throw new Error('Credential derivation unavailable')
assert.equal(await credentials.verify(material, parsed.ok), 'match')
```

示例按包内默认参数执行两次 scrypt 计算，不输出凭据或存储材料。账号接受凭据还需要独立的政策检查。

## 边界与生命周期

默认 cost 为 `2**17`、block size 为 `8`、parallelization 为 `1`、盐为 16 字节、派生密钥为 32 字节。配置校验拒绝非法或超限参数组合。派生设置不是密码政策。

存储材料携带派生参数。验证读取这些参数，不静默采用替换后提供者的默认值。未知方案报告不匹配，计算失败报告不可用。

插件停止不会让 scrypt 计算变得可取消。管理关闭须等待自身拥有的计算实际完成。本提供者不存储账号，也不授予租户权限。详见 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/credential-verification-scrypt run build
pnpm --filter @omne-harness-lite/credential-verification-scrypt run typecheck
pnpm --filter @omne-harness-lite/credential-verification-scrypt run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

测试覆盖 scrypt 与政策结果。可用线程池及内存资源会影响计算耗时。

## 相关包

- [公共凭据定义](../../core/account-identity/README.md)
