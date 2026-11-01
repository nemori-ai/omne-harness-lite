# Identity 的 Cordis 定义入口

## 采用与范围

`@omne-harness/identity/cordis` 提供四个抽象 `Service` 类及对应键。定义按 [#991 的局部采用](https://github.com/nemori-ai/omne-harness-lite/issues/991#issuecomment-6552957257)维护，实施范围是 [#992](https://github.com/nemori-ai/omne-harness-lite/issues/992)。公开形状来自本成员根入口，行为仍由 [SPEC ID-16 与 ID-17](../SPEC.md)拥有。根入口不加载 Cordis。

| 抽象类                        | 键常量                  | 服务键               | 原接口                 |
| ----------------------------- | ----------------------- | -------------------- | ---------------------- |
| `IdentityOperationsService`   | `identityOperationsKey` | `identityOperations` | `IdentityOperations`   |
| `TenantStandingSourceService` | `tenantStandingKey`     | `tenantStanding`     | `TenantStandingSource` |
| `PrincipalVerifierService`    | `principalVerifierKey`  | `principalVerifier`  | `PrincipalVerifier`    |
| `PrincipalIssuerService`      | `principalIssuerKey`    | `principalIssuer`    | `PrincipalIssuer`      |

每个类的抽象成员直接引用原接口的成员类型。键常量引用类的 `static readonly provide`。构造函数用这个键登记服务，`Context` 增补四个同名属性。提供者继承相应类并实现原接口，消费者从此入口导入键。运行时对象通过能力接缝交付，不放进可序列化的插件配置。

采用的内核是官方发布包 `@deepseek-ai/cordis` 4.0.4，本成员没有自有 fork。注册与撤除的机制依据是 [Service 子类 probe](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md)。集成边界沿 [IC-1 至 IC-5](../../../../docs/architecture/cordis-integration-conventions.md)。

## 受控测试根示例

下面在测试根中安装进程内参考权威的核验器。它只演示定义消费，不是生产身份装配。

```ts
import { Context } from '@deepseek-ai/cordis'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { PrincipalVerifierService, principalVerifierKey } from '@omne-harness/identity/cordis'

const authority = inProcessPrincipalAuthority()
class Verifier extends PrincipalVerifierService {
  readonly verify = authority.verifier.verify
}
const ctx = new Context()
const fiber = await ctx.plugin(Verifier)
const verifier = ctx.get(principalVerifierKey)
if (!verifier) throw new Error('verifier not installed')
await verifier.verify({ kind: 'system', component: 'hand-built' }) // rejected
await fiber.dispose()
// ctx.get(principalVerifierKey) === undefined
```

生产根不得自动安装完整 `PrincipalIssuerService`。签发者只交给装配声明的受信具名持有者，签发代租户主体前仍须核对原工作关系。服务键存在不授予权限，也不建立这项关系。上述定义不增加生产签发者、工作资格守卫或系统恢复权限。

撤除后通过键不能再取得该实例。此处不承诺撤销已签发主体、取消已开始的操作或使外部效果可逆。持有旧引用的在途责任、持久性与恢复由真实提供者和装配承担。

## 验证资源与限制

- `tests/cordis.spec.ts` 在真实 4.0.4 `Context` 上安装具体子类，检查四键、委托、主体对象一致性与撤除。Operations 子类用闭包持有 `./testing` 参考替身，运行原 `checkIdentityOperationsContract` 套件。参考替身没有未激活账号，因此该套件的 `login-inactive-uniform` 仍不适用。
- `tests/cordis.spec-d.ts` 检查七个原接口成员类型、Context 属性和错误赋值。它不复制结果联合。
- `tests/cordis-package.spec.ts` 打包并解包本成员，在独立目录消费 `dist` 与类型声明。依赖复用已锁定的本机产物，不安装新依赖。Node 加载钩子拒绝根入口的 Cordis 导入，独立消费者验证 `./cordis` 的加载、注册与撤除。

Standing 用例只证明测试读口结果的委托，不证明真实成员资格存储。Operations 套件不覆盖两种主体或完整签发者持有边界。以上验证不覆盖生产数据库、跨进程来源、系统恢复或完整服务端组合。
