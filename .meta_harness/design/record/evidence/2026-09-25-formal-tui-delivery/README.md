# CQ2有限交付模型与表单映射

实际2026-09-25本地运行，任务[governance-cli-entry-v2-tui-delivery](governance-cli-entry-v2-tui-delivery/README.md)。r1的None字符串与数字修订比较触发TLC类型错误，保留原始失败，不能当语义反例。r2将None改为数字2，正配置112 distinct/227 generated，无反例；五个坏配置分别违反VisibleBeforeConfirmation、RestoreAfterActualWork（输入/输出两类）、BorrowedStateReleasedLast、NoLateOutput，退出12。

执行环境Docker Linux aarch64、eclipse-temurin:25-jre、TLC2.19（tla2tools1.7.4，SHA256 936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88），每个目录独立可写/run。命令为java -XX:+UseParallelGC -cp /tools/tla2tools.jar tlc2.TLC -workers 1 -config model.cfg TuiDelivery；r1未加ParallelGC。模型/配置和原始日志均保留；未复制TLC临时状态。

模型限两个界面修订、至多一个目标、输入与实际输出和CG静止分别建模；弱公平前提归原模型及input/formal/README.md.txt。队列容量由模型形状限定，不作为容量证明；setup、UTF8、真实模拟器/IME、模式控制IO与关闭异常均未由模型验证。不是无条件安全证明。

表单检查用Python jsonschema Draft202012Validator，运行check-cq2-forms.py（从仓库根）；r3验证34表单与冻结CQ1/EC2精确字段/动作/秘密槽、39正反例。它没有运行TUI或取得秘密后的实际请求，不能替代实施验证。不同迭代原始日志一并保留，input为最终CQ2候选快照，接受状态另归决定/registry。

导航勘误：2026-09-25将任务目录链接改为其README文件，修正检查器拒绝目录链接；原始模型/日志未改。
