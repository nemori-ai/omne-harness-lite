import * as json from './json.mjs';
import { installExactKeywords } from './exact-runtime.mjs';
export { schemaPattern } from './pattern.mjs';
export const keywords = {};
installExactKeywords({ addKeyword: definition => { keywords[definition.keyword] = definition.validate; } });
function projection(value, owner) {
  if (owner.LosslessNumber.is(value)) {
    const n = Number(value.source)
    return Number.isFinite(n) ? n : value.source.startsWith('-') ? -Number.MAX_VALUE : Number.MAX_VALUE
  }
  if (Array.isArray(value)) return value.map(item => projection(item, owner))
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projection(item, owner)]))
  return value
}
export function handoff(validator, text) {
  const parsed = json.readJsonStrict(text);
  if ("failed" in parsed) throw new Error("invalid lossless handoff");
  const valid = validator.call({root: parsed.ok}, projection(parsed.ok, json)) === true;
  return { valid, errors: structuredClone(validator.errors) };
}