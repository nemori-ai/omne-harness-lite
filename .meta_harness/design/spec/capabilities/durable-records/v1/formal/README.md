# Recovery 形式工件

`Recovery.tla`/`Recovery.cfg` 来自 legacy v2 的同名当前工件，覆盖 DR-02 的耐久回执、
DR-03 的新 writer epoch 与 DR-04 的有限尾部恢复。它不覆盖 DR-01 多记录批内顺序、真实 fsync、
并发写者或 DR-05 换代。旧日志不复用；本轮 Java/TLC 不可用时状态为 registered-not-run。
