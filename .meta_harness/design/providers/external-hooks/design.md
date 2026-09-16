# ExternalHooks provider 设计

## 投影与资源

候选 `ExternalHooksPlugin` 提供只读状态服务 `omneExternalHooks`，资源为 tenant asset index、每站点
registration disposer、command process owner、dedup/brake ledger handle 与 durable completion outbox。
adapter 把固定 Claude/Codex 事件映射到 S0/S1/S5/S7/S8/S9/旁路扩展点；extension registration 是
内部权威，外部配置不取得领域服务句柄。每个 runner invocation 只生成一条
`hooks.run.completed`，字段映射写 `fieldEntries[]`，可见呈现写 `presentationEntries[]`。

## 依赖

required：TG asset/membership、AU mode、Session/Run/Driver/Tools/HD/CommandInput extension contracts、
BG reservation、DR/CC durability、CC-02/AU-06 当前撤权/资格屏障、OB completion；缺任一 required site 时 plugin not-ready。MC prompt
projection 与 message-stream `presentationEntries[]` 是 optional consumers：缺失时上下文/用户呈现具名降级，
但 completion 仍耐久。首版 command runner 需要 live-agent execution trust，不声称 sandbox。

## 装载与移除

装载先验证资产与 runner，再依次登记 sites，全部成功才 ready。移除先封新运行和准入，再撤 site
registrations，abort command processes，drain/commit completion outbox，撤 asset index，最后撤服务；
旧 disposer 只撤其 generation。已关闭项、门收紧、trigger、决定与外部进程效果不回滚。
