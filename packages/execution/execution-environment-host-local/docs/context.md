# execution-environment-host-local 的使用与定位

本页说明谁使用本成员、怎样使用，以及本成员在能力组中的位置。系统关系归[系统页执行环境](../../../../docs/architecture/runtime/execution-environment.md)，组内分解归[组入口](../../README.md)，文件使用的跨领域交接归[领域交接设计](../../../../docs/domains/execution-environments/architecture.md#文件使用的交接)。本页不另立架构。

## 使用方式

### 装配

应用装配者在进程宿主里创建一次宿主文件责任域，再装载三个端口服务、服务、`files` 声明插件与宿主文件插件：

```ts
import { Context } from '@deepseek-ai/cordis'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  createHostFilesPlugin,
  filesFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'

const domain = createHostFilesDomain({ quota: tenant => ({ perTenant: 8, global: 256 }) })
const ctx = new Context()
await ctx.plugin(MyEnvironmentAuthority)
await ctx.plugin(MyScopeBinding)
await ctx.plugin(MyRecoveryAuthority)
await ctx.plugin(ExecutionEnvironmentRegistry)
await ctx.plugin(filesFacilityPlugin)
await ctx.plugin(createHostFilesPlugin(domain))
```

三个端口服务分别是 `ExecutionEnvironmentAuthorityService`、`ExecutionScopeBindingService` 与 `ExecutionRecoveryAuthorityService` 的子类，由集成方实现。服务每次使用时从自己装载时的上下文现取它们；取不到时，环境面与恢复面答不可用，不放行。例子里的配额数值只是配置，不是本成员的默认值。Service 与 `filesFacilityPlugin` 不接受配置字段。宿主文件插件只接受 `drainBoundMs`，例如 `ctx.plugin(createHostFilesPlugin(domain), { drainBoundMs: 5000 })`；它是释放、结清与退役等在途文件操作的上界，缺省为初值 10000 毫秒。重载宿主文件插件时交同一个 `domain`，新的一代看到原占用与原获取。

装载之后，集成方、维护者、提供者与设施拥有者的插件经服务定义使用服务，见 [execution-environment-cordis-contract 的使用](../../execution-environment-cordis-contract/docs/context.md#使用方式)。它们不导入本成员。

### 点名对象

执行适配按当前授权点名对象时，用根入口的 `hostObjectToken(路径)` 读出对象的设备号与 inode，把结果作为请求的 `named` 交给 `files` 设施。`hostObjectToken` 只识别对象，不授予访问权，也不替调用方核对授权。新建文件时 `named` 是父目录的身份。

### 一次文件使用

集成方经租约取 `files` 设施，每次操作带新的请求身份：

```text
files = lease.facility('files')
read  = files.read({ requestId, access, origin, binding: lease.placement.binding, path, named })
close = files.close({ requestId: 新的请求身份, access, origin, binding, path, named, handle: read.value.handle })
```

上面的伪代码只表示调用位置。参数与结果归契约的[设施协议](../../execution-environment-contract/SPEC.md#设施协议)，本成员的行为归 [SPEC 宿主文件使用](../SPEC.md#宿主文件使用)。

### 独立使用

不装配 Cordis 的调用方自己保管一个 `createHostFilesDomain()`，把 `createHostFilesProvider({ domain })` 登记到 [execution-environment](../../execution-environment/docs/context.md#独立使用) 的登记表上，经租约使用，得到租户核对与守卫。直接调用 `createHostFiles()` 得到的设施不核对租户，也不问守卫，只适合测试或调用方自己承担这两项核对的组合。

### 初始化与释放

宿主文件设施没有初始化步骤。读取、查看与写入在返回前关闭自己打开的描述符。关闭失败的描述符归所属获取，留在共用文件引擎里；这份获取的下一次操作、释放、结清与责任域的 `maintain()` 重试关闭。服务卸载时关闭登记表，宿主文件插件卸载时这一代宿主文件提供者退役：封住这一代获取的门面，逐份排空，最多 `drainBoundMs`；没有全部结清时为待处置，诊断写入 `ctx.logger`。原记录留在责任域，由新的一代或责任域的拥有者继续结清。

## 消费者与定位

本成员是组里唯一的 Service 实现。下图投影[组架构](../../docs/architecture.md#成员与依赖)里与本成员相关的边，两者不一致时以组架构为准。

```mermaid
flowchart LR
  EEC[execution-environment-contract]
  EECC[execution-environment-cordis-contract] --> EEC
  EE[execution-environment] --> EEC
  HL[execution-environment-host-local] --> EECC
  HL --> EE
  HL --> EEC
  Assembly[应用装配者] -->|装载插件| HL
  Adapter[执行适配] -->|hostObjectToken| HL
```

| 使用方 | 怎样使用 | 用什么 |
| --- | --- | --- |
| 应用装配者 | 创建并保管责任域，装载 `./cordis` 的插件与三个端口服务 | 根入口的 `createHostFilesDomain`；`ExecutionEnvironmentRegistry`、`filesFacilityPlugin`、`createHostFilesPlugin`；三个端口抽象类的子类 |
| 执行适配 | 点名对象 | 根入口的 `hostObjectToken` |
| 独立调用方 | 登记到不含 Cordis 的登记表 | 根入口的 `createHostFilesDomain` 与 `createHostFilesProvider` |

### 现在的真实消费者

现在没有应用装配本成员，也没有包在 `package.json` 里依赖本成员。本成员的测试是现在唯一的使用方。

### 上层页面

- 系统关系与成员分工：[系统页执行环境](../../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)。
- 文件使用的跨领域交接：[领域交接设计](../../../../docs/domains/execution-environments/architecture.md#文件使用的交接)。
- 组内成员与阅读路径：[组入口](../../README.md)、[组协作入口](../../docs/key-flows.md)。
- 共同集成规则：[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。
