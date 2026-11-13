# 对象模型

本文件描述本包内部对象的职责、身份、状态、关联、组合、继承与生命周期，配类图。它不强迫实现改成 class；纯函数或值包写实际模型与不适用项。

## 对象与关系

本包是值包，只有一个对象：`assetsProtocol`，一个 `DefinedProtocol`。它由名字 `assets`、主版本 1 与四个操作契约组成，没有观察；每个操作契约有身份要求、效果、体上限、消息体的读写器和每个结果的读写器或 `true`。

```mermaid
classDiagram
  class assetsProtocol {
    name = "assets"
    major = 1
  }
  class OperationContract {
    identity = "login"
    effect
    limit = "small"
    body: Codec
    outcomes: Codec 或 true
  }
  class SettingView {
    asset
    item
    revision
    declaration
    kind: ordinary | permission | secret
  }
  assetsProtocol "1" *-- "4" OperationContract
  OperationContract ..> SettingView : list 与 describe 的 succeeded
```

## 生命周期

不适用：值在模块加载时构造，不可变，没有身份以外的状态。
