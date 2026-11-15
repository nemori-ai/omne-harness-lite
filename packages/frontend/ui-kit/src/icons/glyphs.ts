import { ACTION_GLYPHS } from './glyph-set-actions.ts'
import { MEDIA_GLYPHS } from './glyph-set-media.ts'
import { OBJECT_GLYPHS } from './glyph-set-objects.ts'

export { type Glyph, MOTIONS } from './glyph-model.ts'

export const GLYPHS = { ...OBJECT_GLYPHS, ...ACTION_GLYPHS, ...MEDIA_GLYPHS }
