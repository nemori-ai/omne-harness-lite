import { describe, expect, it } from 'vitest'
import { assembly, pageAssembly } from '../src/page/assembly.tsx'
import { CONTENT_SECURITY_POLICY } from '../src/shared/page-policy.ts'
import { domainProtocols } from '../src/shared/protocols.ts'

const directives = new Map(
  CONTENT_SECURITY_POLICY.split('; ').map(directive => {
    const [name = '', ...sources] = directive.split(' ')
    return [name, sources] as const
  }),
)

describe('页面策略', () => {
  it('脚本只许同源：没有内联、没有 eval、没有外部来源', () => {
    expect(directives.get('script-src')).toEqual(["'self'"])
    expect(directives.get('default-src')).toEqual(["'none'"])
  })

  it('网络、图片、媒体、字体、样式与内嵌页放到 https:，连接另有 wss:，没有明文 http:', () => {
    expect(directives.get('connect-src')).toEqual(["'self'", 'https:', 'wss:'])
    expect(directives.get('img-src')).toEqual(["'self'", 'https:', 'data:', 'blob:'])
    expect(directives.get('media-src')).toEqual(["'self'", 'https:', 'blob:'])
    expect(directives.get('font-src')).toEqual(["'self'", 'https:', 'data:'])
    expect(directives.get('style-src')).toEqual(["'self'", "'unsafe-inline'", 'https:'])
    expect(directives.get('frame-src')).toEqual(['https:'])
    for (const [name, sources] of directives) expect(sources, name).not.toContain('http:')
  })

  it('不许插件对象、不许改 base、表单不提交、不被别人嵌入', () => {
    for (const name of ['object-src', 'base-uri', 'form-action', 'frame-ancestors'])
      expect(directives.get(name), name).toEqual(["'none'"])
    expect([...directives.keys()].toSorted()).toEqual([
      'base-uri',
      'connect-src',
      'default-src',
      'font-src',
      'form-action',
      'frame-ancestors',
      'frame-src',
      'img-src',
      'media-src',
      'object-src',
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

describe('看界面的窗口装的是只看的那一份', () => {
  it('协议清单里有 interface/v1；人用的页装界面检视的模块，只看的页不装，所以不开那条观察', () => {
    const names = domainProtocols.map(protocol => `${protocol.name}/v${String(protocol.major)}`)
    expect(names).toContain('interface/v1')
    const modules = (viewing: boolean) =>
      pageAssembly({ store: () => window.localStorage, viewing }).modules.map(
        module => module.name ?? '',
      )
    expect(modules(false)).toContain('interface-ui')
    expect(modules(true)).not.toContain('interface-ui')
    expect(modules(true)).toEqual(modules(false).filter(name => name !== 'interface-ui'))
  })
})
