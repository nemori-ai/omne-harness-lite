# Calendar 形式验证

[函数契约](../docs/functions-and-totalization.md) 拥有定义域与证明前提。本目录保存可复现模型和负控；运行日志留 tmp。

## 模型范围及实现映射

[CalendarTotalization](models/CalendarTotalization.tla) 是正向第 N 个工作日有界扫描的有限实例。三个日期、覆盖前缀长度 0–3、全部八种工作日集合、ordinal 0–4、fuel 0–3，共 640 个初始组合。ordinal=0 表示非法输入；覆盖长度零表示查询窗口内无已知日期，不声称公开 Schema 接受空日历；零 fuel 表示内部剩余预算。

| 模型对象 | 含义与源码位置 | 证明边界 |
| --- | --- | --- |
| coverageEnd / working | [calculation.ts](../src/calculation.ts) 的覆盖与工作日谓词 | 只建模连续前缀，不覆盖所有真实日期范围和供应合法性 |
| cursor / hits / Scan | 同文件 selectNthWorkingDay 的正向扫描 | 不自动覆盖反向、last、所有日期边界或依赖库行为 |
| fuel / Decide / status | 有界计算及成功、缺覆盖、未完成、确定无结果 | 未建模服务 deadline、网络或宿主抢占 |
| SuccessSound / AbsenceSound | 找到的序号正确；无结果必须有完整依据 | 预算限制和覆盖不足不能伪装成 null |
| WorkAccounted / 其余类型与结果不变量 | 已扫描前缀计数、预算、结果标签合法 | 是抽象状态检查，不是 TypeScript 精化证明 |
| Terminates / SufficientFuelComplete | 弱公平 Decide 下最终返回，足够预算取得已有答案/确定空结果 | 公平性是前提，不给实际耗时上界 |

正控检查七个不变量与两个时序性质。两个错误模型把缺覆盖或预算耗尽改成无结果，应命中 AbsenceSound；另一个把步进改为空转，应生成时序停滞反例。T1–T4 的一般归纳论证见函数契约，此有限实例不能取代无界定理证明，也不是交互式证明助手机械验证。

## 未覆盖与后续要求

权限、环境一致性、供应事务、持久版本、真实时区数据库、内存资源及运行时关闭不在此模型。修改这些路径时在各自拥有者处补验证。公开计算入口的边界与性质测试继续保留；新增算法必须建立自己的不变量及源码映射。

## 执行与判读

环境需要 Python 3、Java 及 TLA+ 的 tla2tools JAR。使用维护者提供的工具，不由脚本联网下载。已核对 TLC 2.19（tla2tools 1.7.4 发布物）与 Java 21；升级工具后重验正控和负控。设置 `TLA2TOOLS_JAR` 为实际 JAR 文件绝对路径，必要时设置 `JAVA_BIN`。

```sh
pnpm --filter @omne-harness/calendar verify:formal
python3 packages/calendar/calendar/verification/check.py --self-test
```

[清单](models.json) 声明每个配置及期待结果。[执行器](check.py) 每个配置只用一个 worker，512 MiB 堆和 60 秒期限。正控必须退出 0 且有完整成功标志；不变量负控必须退出 12 并命中指定不变量；时序负控必须退出 13 并有循环/停滞反例。解析错误、错打不变量、工具缺失、超时或中断均不算通过。自检包含九个真假结果判读样本。

输出写入仓库 `tmp/formal/calendar/<时间-进程>/`，包含命令、日志、模型/配置/执行器哈希、Git head、JAR 哈希及 Java 版本。Git head 不代表未提交输入，因此输入哈希必须一并保留。负控的“passed”表示成功检出预期缺陷，并非错误模型满足性质。

这是显式包级守护，尚未自动接入根 `pnpm run check`。涉及本说明性质的切片在实施前和交回前均调用；若其前提、模型或工具变化，重新执行全部相关正负控。没有生产源码精化证明，不把此命令替代公共 API 测试、存储故障、集成或独立接受。
