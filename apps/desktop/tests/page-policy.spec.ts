import { describe, expect, it } from 'vitest'
import { assembly } from '../src/page/assembly.tsx'
import { CONTENT_SECURITY_POLICY } from '../src/shared/page-policy.ts'
import { domainProtocols } from '../src/shared/protocols.ts'

const directives = new Map(
  CONTENT_SECURITY_POLICY.split('; ').map(directive => {
    const [name = '', ...sources] = directive.split(' ')
    return [name, sources] as const
  }),
)

describe('页面策略', () => {
  it('图片只放行应用自己的地址、data: 与页面自己造的 blob: 地址', () => {
    expect(directives.get('img-src')).toEqual(["'self'", 'data:', 'blob:'])
  })

  it('语音只放行页面自己造的 blob: 地址：按了「播放」读回原件交给播放器', () => {
    expect(directives.get('media-src')).toEqual(['blob:'])
  })

  it('别的指令没有为图片放宽：脚本、样式、连接只有应用自己，缺省什么都不许', () => {
    expect(directives.get('default-src')).toEqual(["'none'"])
    for (const name of ['script-src', 'style-src', 'connect-src', 'font-src'])
      expect(directives.get(name), name).toEqual(["'self'"])
    expect([...directives.keys()].toSorted()).toEqual([
      'base-uri',
      'connect-src',
      'default-src',
      'font-src',
      'form-action',
      'frame-ancestors',
      'img-src',
      'media-src',
      'script-src',
      'style-src',
    ])
  })
})

describe('媒体进了装配', () => {
  it('协议清单里有 media/v1，页面与转发层读的是同一份', () => {
    const names = domainProtocols.map(protocol => `${protocol.name}/v${String(protocol.major)}`)
    expect(names).toContain('media/v1')
    expect(assembly.protocols).toBe(domainProtocols)
  })

  it('协议清单里有 mcp/v1：MCP 页的状态与动作清单经它读', () => {
    const names = domainProtocols.map(protocol => `${protocol.name}/v${String(protocol.major)}`)
    expect(names).toContain('mcp/v1')
  })

  it('界面模块里有媒体的；装配里没有专管转交的插件', () => {
    const names = assembly.modules.map(module => module.name ?? '')
    expect(names).toContain('media-ui')
    expect(names.filter(name => name.startsWith('hand-over'))).toEqual([])
  })
})
