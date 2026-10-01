# D-071 模型值提供者增量采用

2026-09-27。用户明确实施委托下，主线在[D-070](../model-adaptation-binding-acceptance/decision.md)接受的精确规范上，采用三个已独立复审的纯模块增量投影。依据[候选与复审](../../proposals/model-request-adaptation/review.md)。

model-profile root/schema采用3，显式v2纯值/Schema保留。messages与model-response root/schema采用4，保留既有3函数/类型到显式v3及完整Schema3；2仅保留已存在的Schema。旧loop-extension3等实际消费者改钉原profile2/messages3对应公共入口，不随root升级。精确实现设计摘要、范围及消费端口在acceptance.json。

采用包括无损JSON处理、具名判定次序、完整绑定比较和固定Schema闭包。纯模块没有存储或装卸责任，不取得模型注册引用。模型与配置的实际适用性、动态租约、请求事实、快照耐久及调用结算留在目录/runtime/transport所有者。

接受实现映射不等于实现已经完成。当前三版产品源码与新制品验收尚待执行；人的总体交付签收仍未发生。其余候选与提供者不因本事件被接受。
