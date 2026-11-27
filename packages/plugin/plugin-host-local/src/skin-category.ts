import { heldPoint, type CategoryDisplay } from '@omne-harness/assets'
import type { PluginManifest } from '@omne-harness/plugin-protocol'

export const SKIN_CATEGORY = 'skin'

export const skinCategoryDisplay: CategoryDisplay = Object.freeze({
  title: '皮肤',
  summary:
    '一份只改界面的 Plugin：清单写明它是皮肤。一个租户可以持有几套，界面同一时刻只用其中一套，换的时候各处一起换。',
  creation: '一个目录，根下有 plugin.json，清单里写 "kind":"skin"；只有 client 一侧的成员。',
  authoring: [
    'plugin.json, whole and minimal:',
    '{"schema":1,"name":"sea","summary":"One sentence on how it looks.","kind":"skin","client":{"members":[{"point":"<point>","key":"<key>","data":{}}]}}',
    'A skin is a plugin with "kind":"skin" and members under client only. A member names a point and a key and gives data (a JSON value) or module with export (a .js file here and the name it exports).',
    'Layers, each a point; use those the look needs: shell.tokens on shell.app (colours, radii, fonts); shell.part-style (CSS of a part at rest and in each state); shell.part-render (draw a part, around builtIn); shell.icon (an icon, by name); shell.piece (loading, empty-state, inline-notice, figure).',
    'OmneExtensionPoints show <point> lists the keys a point takes and what a value or a drawing is given. A part takes only the layers it opens.',
    'Light and dark: write colours as light-dark(light, dark). The whole guide is the skill skin-authoring (Skills read).',
    'Images: carry .png, .jpg, .webp, .avif or .svg files that begin as their kind does. A value points at one with file(path); code gets files.url(path). Ship art you may ship: draw your own.',
    'Before you finish: a publish that is refused says why. Enable the skin; a person wears it on the assets page and sees it in light and dark. A drawing that throws falls back to the built-in at that place.',
  ].join('\n'),
})

export const skinSkinsPoint = heldPoint({
  name: 'plugin.skins',
  key: 'the skin name',
  summary:
    'The skins held: each is a plugin of members of the interface alone, put in a scope of its own, and the interface wears one of them at a time.',
})

const HAS_SERVER_SIDE =
  'a skin has members of the interface only, and this manifest writes a server side: leave server out'

/** A side counts as written when it has a member or a need: an empty one is as good as none. */
function writesServer({ server }: PluginManifest): boolean {
  return server !== undefined && server.members.length + (server.needs ?? []).length > 0
}

/** Why a manifest cannot be held as a skin; null when it can. */
export function skinFault(manifest: PluginManifest): string | null {
  if (manifest.kind !== 'skin')
    return 'the manifest does not say it is a skin: write "kind":"skin", or publish it to the category plugin'
  return writesServer(manifest) ? HAS_SERVER_SIDE : null
}

/** Why a manifest cannot be held as a plain plugin; null when it can. */
export function plainFault(manifest: PluginManifest): string | null {
  if (manifest.kind !== 'skin') return null
  const then = writesServer(manifest) ? `; ${HAS_SERVER_SIDE}` : ''
  return `the manifest says it is a skin: publish it to the category skin${then}`
}
