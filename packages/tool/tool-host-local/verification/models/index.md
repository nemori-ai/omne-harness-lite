# tool-host-local 协议模型索引

- [环境准备与 driver 的有限边界、前提、性质和执行](README.md)。
- [环境准备模型](EnvironmentPreparation.tla)。
- [driver 模型](EnvironmentDriver.tla)。
- [检查与证据采集入口](check-models.mjs)。
- [启动围栏模型](StartFence.tla)，性质与映射见 [formal-mapping.md](../formal-mapping.md)。它守单域 `start-coordinator` 的围栏，随该域一起退出。
- [推送退避模型](DeliveryBackoff.tla)。
- [启动受理与 guard 域的读集断言模型](start-consume/README.md)：调用域受理与租户级 guard 域失效的线性化，含具名负控和运行入口。
- [保留作用域的单一归属模型](retention-scope/README.md)：预留留在创建者的获取记录，作用域只保存已接手的条目，开放与已关闭两态，接手作为唯一跨域提交的两侧断言，创建者对自己预留的停止记账，以及契约停止答复；含进展性质、具名负控和运行入口。
- [启动围栏与推送退避的 WSL 运行入口](run-tlc.sh)。
- [包索引](../../index.md)。
