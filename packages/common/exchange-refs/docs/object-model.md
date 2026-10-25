# 对象模型

本文件描述本包内部对象的职责、身份、状态、关联、组合、继承与生命周期。本包是纯类型包，只有三个只读记录类型，没有 class、继承或持久状态，所以下面写实际的值模型和不适用项。

## 对象与关系

```text
Adoption        = { owner, name, revision, digest }      可以恢复的精确采用
DurableEvidence = { owner, record, revision, digest }    一个 owner 的一份耐久记录的定位
ConsumerRef     = { owner, work, position, purpose }     消费者拥有者登记的稳定位置
```

每个成员都是必需的只读 `string`。三个值之间没有组合或继承。各域的协议可以把它们放在一起使用，例如 Model 的 ACK 同时带 `ConsumerRef` 与 `DurableEvidence`。两者之间的规则，例如证据的 `owner` 等于消费者的 `owner`，归那个协议的拥有者，不归本包。

三个值都没有本包内的身份。每个值的身份与含义由它的 owner 决定：`Adoption` 由被采用物的发布者决定，`DurableEvidence` 由 `owner` 决定，`ConsumerRef` 由消费者拥有者决定。三个值都不含租户。

## 生命周期

值由铸造方创建，之后只读传递，没有变化和销毁责任。本包不创建、不持有、不缓存也不注册任何值。
