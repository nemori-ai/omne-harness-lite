# Session 持久提供者：设计映射

## 采用接口

提供者消费 `capability.durable-records@1` 的精确候选坐标。目标是消费受限 `RecordReader`/Watermark/decoder 的纯恢复过程，不提供 Cordis 服务或 writer；`recoverSession` 尚未实现，当前默认入口只有 `/baseline`。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/session/persistence/design.md`，SHA-256 `cbf488cd5c3832913a5a30975ef607f86aae1709154cd846bf3a737d99858bac`。只有 baseline-facing 设计；recover 与完整 Session 恢复尚未实现，新 v1 联合符合性无证据。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

## 持续消费的映射


| 阶段 | 目标责任 | 当前状态 |
|---|---|---|
| 输入 | 获准 reader、已同步 Watermark、decoder/fold 与精确版本表 | 目标接口，默认入口当前只有 `/baseline` |
| 恢复 | 验证完整 envelope、同批关系和版本；未知/缺 owner 具名失败 | `recoverSession` 尚未实现 |
| 顺序 | records 扫描→各 owner fold→关系校验→裁决扫描→投影→attempt 核实→当前资格→调度 | 设计顺序，未有产品恢复测量 |
| 清理 | 成功/取消/失败释放本次 reader use；host generation 防晚到安装 | writer/锁最终释放仍归宿主 |
