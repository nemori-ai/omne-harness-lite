// 规则在共享预设里维护：@omne-harness/repo-config 的 dependency-cruiser.cjs，版本由 pnpm-workspace.yaml 的 catalog 钉住。
// 这里只加本仓库应用独有的两条：发行的服务端装配不导入模拟时间源（apps/harness-server/SPEC.md HS-50），也不导入实验装配。
const preset = require('@omne-harness/repo-config/dependency-cruiser.cjs')

module.exports = {
  ...preset,
  forbidden: [
    ...preset.forbidden,
    {
      name: 'release-server-not-simulated-time',
      comment:
        'The release assembly of the server builds only the system time source; the simulated one is for the lab entry (src/lab). apps/harness-server/SPEC.md HS-50',
      severity: 'error',
      from: { path: '^apps/harness-server/src/', pathNot: '^apps/harness-server/src/lab/' },
      to: { path: '^packages/assembly/time-source/(src|dist)/simulated' },
    },
    {
      name: 'release-server-not-lab',
      comment:
        'The release assembly of the server does not import the lab assembly: the scripted model gateway and the lab rows are for the lab entry (src/lab). apps/harness-server/SPEC.md 实验装配',
      severity: 'error',
      from: { path: '^apps/harness-server/src/', pathNot: '^apps/harness-server/src/lab/' },
      to: { path: '^apps/harness-server/src/lab/' },
    },
  ],
}
