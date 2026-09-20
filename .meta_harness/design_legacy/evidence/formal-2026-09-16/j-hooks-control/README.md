# J：Hooks、Run 控制与授权门的有限证据

当前重放输入基线 `0bfd07985589119283550201e3a2529b7f84ff14`，日期 2026-09-16；
最初建模基于 `d6669f28072e759f40a64386836b333f06d71d4c`。
模型范围、前提和剩余义务见[形式入口](../../../spec/capabilities/external-hooks/v1/formal/README.md)。
[results.json](results.json) 固定 D-018、D-020、HK/RN/RD/AU/HD/SE/TL/CC
完整契约输入 SHA-256、模型/配置哈希、实际命令、工具哈希和每份原始日志哈希。
不把目标文件哈希视为全文接受；D-018 的接受仅覆盖所列设计方向。

## 实际结果

三个正常配置均退出 0，同时完成 Safety 与条件 Progress 的全部可达状态检查。
十个缺陷配置均退出 12，并给出 `Invariant Safety is violated` 的具体执行轨迹。
没有用语法错误、死锁或工具失败充当成功的反例测试。

| 配置后缀 | 故意违反的边界 |
|---|---|
| stop-cap | take 不重查 cap，两个 handler 都占用 slot |
| stop-revision | take 使用途中改变的 cap=2，违背固定 revision |
| stop-barrier | stopping 时仍处置后续队列项 |
| stop-force | unknown 隔离直接报告 cancelled |
| gate-rerun | 超时后再次执行同一 hook |
| gate-revoke | 准入忽略已生效撤权 |
| gate-cancel | 准入忽略 cancel/force_stop 的执行权撤销 |
| gate-answer | 程序化答复忽略当前资格/confirm 模式 |
| gate-loosen | 超时把 ask 放宽为 allow |
| close-context | 已关闭项的 context 注入 Step |

原始 `JointHooksRunControl.*.log` 均在本目录；配置和模型在上方形式入口。
正常结果不表示真实 provider 已实现，反例表示检查能捕获指定错误，并非实际实现存在该错误。

## 重放与独立复核

在当前检出根执行，选择与 manifest 哈希相符的现有工具：

```sh
JAVA=/absolute/path/to/java TLA_JAR=/absolute/path/to/tla2tools.jar \
  python3 .meta_harness/design/evidence/formal-2026-09-16/j-hooks-control/run.py
```

[run.py](run.py) 每配置使用独立临时 TLC state 目录，保留日志与 manifest；
重放会更新本目录执行证据。所记录工具为 TLC 2026.09.12.025210 / rev 867aefb、
Eclipse Adoptium Java 21.0.12.1。执行异常会使整个重放失败。

独立审阅交接重点：核对 Observe 的固定来源与 successor Run 区分、控制/授权联合动作、
cap 原子门和 revision 抽象、close 审计映射、环境进展前提、十个反例轨迹及覆盖措辞。
独立审阅已复核当前输入哈希与全部十三项结果；结论限于所列有限状态、固定环境与原子门抽象。
