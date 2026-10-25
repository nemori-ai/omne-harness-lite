# 执行环境登记表的机制流程

本页给出本成员的六条机制级流程。每条有一张图和一张「失败与责任交接」表。行为以 [SPEC](../SPEC.md) 为准，图只投影它。

协议级流程归 [execution-environment-contract 的流程](../../execution-environment-contract/docs/flows.md)。Cordis 上的登记与撤除归 [execution-environment-cordis-contract 的流程](../../execution-environment-cordis-contract/docs/flows.md)，服务装载与卸载归 [execution-environment-host-local 的流程](../../execution-environment-host-local/docs/flows.md)。

## 流程

### F-EER01 落点解析到交付租约

依据：[SPEC 访问核验](../SPEC.md#访问核验)、[SPEC 落点解析](../SPEC.md#落点解析)、[SPEC 获取](../SPEC.md#获取)。

```mermaid
sequenceDiagram
  participant I as 集成方
  participant R as 登记表
  participant G as 环境授权与作用域绑定
  participant T as 获取表
  participant P as 提供者
  I->>R: resolvePlacement(访问身份, 请求方作用域与要求)
  R->>G: authorize(resolve)，再 lookup(请求方作用域)
  R->>R: matchProviders（清单顺序；同层多个合格提供者按歧义拒绝）
  R-->>I: 落点（带配额域）或拒绝
  I->>R: acquire(访问身份, 获取键, 原调用, 请求方作用域, 落点, 账本, 守卫)
  R->>G: authorize(acquire, 原获取描述)，再 lookup(请求方作用域)
  alt 本租户的键已存在
    R-->>I: 指纹、账本与守卫相同按同键重复作答；不同 acquisitionConflict
  else 本租户的新键
    R->>T: 写入，状态获取中
    R->>R: 重新核对落点
    R->>P: quota(租户)
    alt 不可用、未知或授权已撤销
      R->>T: 删除这条记录
      R-->>I: unavailable、阶段 preflight 的未知或 notAuthorized
    else 已声明
      R->>P: acquire(获取键, 原调用, 请求方作用域, 落点, 租户, 账本)
      alt 抛出或答未知
        R->>T: 状态分配未知
        R-->>I: 阶段 allocation 的未知，见 F-EER06
      else 临时回执
        R->>T: 状态临时
        R->>R: 采用核验（含 current()）
        alt 核验通过
          R->>R: 签发采用记录，建立租约视图
          R->>T: 状态已获取
          R-->>I: 租约与采用记录
        else 核验失败
          R->>T: 状态采用失败，清理 pending
          R->>P: 释放回执的租约原件，最多等 cleanupWaitMs
          R-->>I: allocationFailed，带原因与清理状态
        end
      end
    end
  end
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 访问核验 | 授权拒绝、作用域未绑定或绑定到另一租户都为 `notAuthorized`；不可用为 `unavailable`；未知时落点解析答 `LookupUnknown`，获取答阶段 `preflight` 的未知 | 不读获取表，不调用提供者；答复不泄露另一租户 |
| 落点解析 | 选中清单里第一个恰好有一个提供者满足的层。提供者的设施键只算声明表里已登记的那些 | 同一层两个或更多提供者都满足时返回 `ambiguousEnvironment`，不按登记顺序选。没有匹配返回最接近的原因；所需键的声明没有登记时是 `missingFacility` |
| 访问身份里的租户未铸造 | 落点解析与获取返回 `invalidInput`，不写获取表，不调用提供者 | 集成方用 legal-identity 解析出的租户重新请求 |
| 请求方作用域 | 已释放时落点解析与获取返回 `referenceExpired`；带作用域的绑定层与它不同时返回 `invalidInput`，不写获取表 | 获取记下请求方作用域，描述、作用域释放与恢复都按它过滤 |
| 本租户的键已存在 | 不再调用提供者，记录不变 | 原获取描述的指纹、账本或守卫不同时返回 `acquisitionConflict` |
| 另一租户用同一个键 | 是它自己的一次独立获取 | 两个租户互相看不见对方的记录 |
| 重新核对 | 任一项不成立即拒绝，原因写入获取表 | 不换落点 |
| 配额预查 | 只判断配额能不能读；读不到时删除记录 | 超额只由提供者在 `acquire` 里原子接纳时判定 |
| 提供者调用 | 提供者拒绝时原因原样返回 | 抛出或答未知时为分配未知，同键不重发，见 F-EER06 |
| 采用失败 | 记录原因，经回执清理 | 清理待处置或未知时记录保留该状态，并给出诊断 |
| 交付 | 采用记录由集成方保存 | 本成员只有进程内副本 |

### F-EER02 一次设施操作过门

依据：[SPEC 租约视图与逐操作门](../SPEC.md#租约视图与逐操作门)。

```mermaid
flowchart TD
  A[调用租约视图上的操作] --> B{请求形状完整}
  B -->|否| X1[rejected invalidInput]
  B -->|是| C{租约仍接纳新操作}
  C -->|否，已失效或释放已发起| X2[rejected closed]
  C -->|是| L{这次获取的账本未关闭}
  L -->|否| X2
  L -->|是| U{此刻的设施声明列出该操作}
  U -->|否| X6[rejected unsupported]
  U -->|是| D{请求租户等于获取方租户}
  D -->|否| X3[rejected notAuthorized]
  D -->|是| K{请求绑定层等于落点绑定层}
  K -->|否| X1
  K -->|是| E{须授权的操作}
  E -->|否| G[调用提供者设施]
  E -->|是| F{守卫}
  F -->|不允许| X4[rejected notAuthorized]
  F -->|不可用或抛出| X5[rejected unavailable]
  F -->|允许| H{租约仍接纳新操作且账本未关闭}
  H -->|否| X2
  H -->|是| G
  G --> R[提供者设施的结果原样返回]
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 门拒绝 | 不调用提供者设施，没有外部效果 | 拒绝带原请求身份 |
| 账本已关闭 | 返回 `closed`，不问守卫，不调用提供者设施 | 门是设施操作的唯一入口，提供者不再为经门的操作重复这项核对 |
| 守卫不可用 | 返回 `unavailable` 拒绝，操作没有发出 | 集成方稍后用新的请求身份重试 |
| 调用提供者设施 | 结果是设施结果四态之一 | 受管资源的计划与许可由提供者经账本承担 |
| 未列入声明的成员 | 不经过门 | 设施拥有者须列全操作 |

### F-EER03 释放与重试

依据：[SPEC 失效与释放](../SPEC.md#失效与释放)。

```mermaid
stateDiagram-v2
  [*] --> acquired
  acquired --> invalidated : 提供者退役 / 作用域释放 / 关闭 / 原件失效
  acquired --> releasing : release()
  invalidated --> releasing : release()
  releasing --> released : 原件释放成功，租约失效
  releasing --> pendingRelease : 原件待处置或抛出
  pendingRelease --> releasing : 再次 release()
  released --> [*]
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 释放发起 | 租约立即不再接纳新操作，新操作返回 `closed` | 释放待处置后仍不接纳 |
| 并发释放 | 共用一次原件调用 | 无 |
| 待处置 | 带未停的受管资源 | 集成方保存释放记录；维护者可走 F-EER04 |
| 已释放后再释放 | 直接返回已释放，不调用原件 | 无 |
| 丢掉引用 | 不是释放，获取表保留记录 | 集成方负责调用释放 |

### F-EER04 作用域释放与恢复

依据：[SPEC 恢复](../SPEC.md#恢复)、[契约的恢复](../../execution-environment-contract/SPEC.md#恢复)。

```mermaid
sequenceDiagram
  participant M as 维护者
  participant R as 登记表
  participant A as 恢复授权端口
  participant P as 各提供者
  M->>R: releaseScope(作用域, 恢复授权, 已知原获取描述)
  R->>R: 核对已知列表合形且属于该作用域
  R->>R: 收集该作用域待处置释放的受管资源
  R->>A: authorizeRecovery(恢复授权, 作用域, 已知资源)
  alt 不允许、不可用或未知
    R-->>M: 拒绝或 LookupUnknown
  else 允许
    R->>R: 记作用域为已释放，使请求方作用域为它的租约失效（含宿主机与租户级沙箱）
    loop 资源路径，按登记顺序
      R->>P: listRecoveryResources(作用域)
      P-->>R: 资源列表或不可用
      R->>P: recover(资源)
      P-->>R: 已确认停止、待处置或不支持
    end
    loop 获取路径，每个配额域一次
      R->>P: listAcquisitions(作用域)
      P-->>R: 原获取描述列表或未知
    end
    loop 列出的与已知的每一项
      R->>P: settleAcquisition(原获取描述)
      P-->>R: 已结清、未分配、待处置、不支持、冲突、不可用或未知
    end
    R-->>M: 资源三组、获取三组与不可用
  end
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 已知列表 | 任一项不合形或不属于该作用域时 `invalidInput`，不问授权 | 维护者修正列表后重试 |
| 授权 | 一次端口调用决定这次恢复 | 端口抛出时答 `LookupUnknown`，原因 `authority` |
| 提供者缺恢复操作 | 记为不支持 | 资源处置留给该提供者的拥有者 |
| 枚举失败 | 记为不可用，不当空集 | 维护者稍后重试 |
| 停止失败 | 资源记为待处置 | 资源仍在集成方账本里 |
| 获取列出失败 | 该登记记为不可用，不当空集 | 维护者稍后重试 |
| 结清答冲突或未知 | 记为待处置获取，原因 `unknown` | 名额仍算占用，维护者稍后重试 |
| 结清成功 | 相同指纹的本地记录转为已释放或已结清 | 本成员不自己归还名额 |
| `recoverOwned` | 与上图相同，但不记作用域已释放，不使租约失效 | 作用域内仍可获取 |

### F-EER05 提供者退役与关闭

依据：[SPEC 登记与退役](../SPEC.md#登记与退役)、[SPEC 关闭](../SPEC.md#关闭)。

```mermaid
flowchart TD
  A[撤除提供者] --> B[标为不在场]
  B --> C[使它交出的租约以 providerRetired 失效]
  C --> D[调用 retire]
  D -->|已排空| E[从提供者表移除]
  D -->|待处置或抛出| F[留在表里不参与匹配；撤除函数抛出 RetirementPending]
  G[close] --> H[记为已关闭]
  H --> I[使全部租约以 registryClosed 失效]
  I --> J[并发退役全部提供者]
  J -->|全部已排空| K[返回已排空]
  J -->|有待处置| L[返回待处置，合并未停资源]
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 退役待处置 | 撤除函数抛出，不以正常返回报告完成 | 再调用同一撤除函数会再次 `retire()` |
| 关闭后 | 新解析、获取、描述返回 `ownerStopped`；尚未采用的临时记录转为采用失败 | 已有键仍按同键规则返回当前状态；恢复两操作仍可用 |
| 在途获取 | 采用核验时看到已关闭，以 `ownerStopped` 采用失败并经回执清理 | 清理待处置或未知时记录保留该状态 |
| 在途设施操作 | 由原提供者在 `retire()` 中结清 | 本成员不另外等待，也不计时；`retire()` 在提供者自己配置的上界内返回，超界为待处置 |

### F-EER06 丢失答复与原获取查询

依据：[SPEC 查询](../SPEC.md#查询)、[契约的原获取的查询与结清](../../execution-environment-contract/SPEC.md#原获取的查询与结清)。

```mermaid
sequenceDiagram
  participant I as 集成方
  participant R as 登记表
  participant P as 原配额域的提供者
  I->>R: inspectAcquisition(访问身份, local 获取键)
  R->>R: 访问核验（只问授权）
  alt 记录处于分配未知、获取中、无回执的临时或清理未结清
    R->>P: inspectAcquisition(原获取描述)
    P-->>R: 原记录的答复
    R->>R: 版本号没变才按缓存表更新本地副本
  end
  R-->>I: 当前状态、冲突、queryUnavailable 或 queryUnknown
  I->>R: acquire(同一获取键与描述)
  R->>R: 临时且有回执时进入同一次采用转换
  R-->>I: 租约与采用记录，或同键答复
  I->>R: inspectAcquisition(访问身份, original 原获取描述)
  R->>R: 访问核验；描述的租户等于访问租户
  R->>P: inspectAcquisition(原获取描述)
  R-->>I: 提供者的事实，附本地采用记录；从不交出租约
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 路由 | 优先原提供者代，否则同一配额域的另一份登记 | 没有该配额域的路由时 `queryUnavailable`；从不问另一配额域 |
| 原记录答已分配 | 本地只保留回执，状态为临时 | 下一次同键获取才采用，并发重复只采用一次 |
| 原记录答未分配 | 终局拒绝 `allocationNotPerformed` | 同键重复得到同一原因 |
| 原记录与本地已确认事实矛盾 | `queryUnknown`，给出诊断 | 本地状态不变 |
| 原获取描述的租户不是访问租户 | `refused`（`notAuthorized`），不调用提供者 | 无 |
| 恢复查询 | 先问恢复授权，再问原记录 | 授权的不允许、不可用与未知分别作答，原因 `authority` |

## 失败与生命周期

| 情形 | 结果 | 责任方 | 依据 |
| --- | --- | --- | --- |
| 进程失败 | 四张表丢失，重启后按键查询答复 `unrecorded`；按原获取描述查询仍问原配额域 | 集成方据账本处置 | [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) |
| 重启后对旧键再 `acquire` | 交给提供者，由它的原记录认回、答冲突或作为新获取 | 集成方先查账本；原记录只在进程内的提供者在进程重启后答未知 | [SPEC 查询](../SPEC.md#查询) |
| 提供者 `acquire` 抛出 | 分配未知，同键不重发，给出诊断 | 提供者；集成方经查询取得原记录 | [SPEC 获取](../SPEC.md#获取) |
| 提供者 `retire()` 抛出 | 按待处置处理，资源列表为空 | 提供者与维护者 | [SPEC 登记与退役](../SPEC.md#登记与退役) |
| 守卫抛出 | `unavailable` 拒绝 | 集成方 | [SPEC 租约视图与逐操作门](../SPEC.md#租约视图与逐操作门) |
| 恢复授权端口抛出 | 恢复答 `LookupUnknown`，恢复查询答 `queryUnknown`，原因都是 `authority` | 集成方的维护拥有者 | [SPEC 恢复](../SPEC.md#恢复) |
| 环境授权或作用域绑定抛出 | 按未知作答，不读获取表，不调用提供者 | 集成方 | [SPEC 访问核验](../SPEC.md#访问核验) |
