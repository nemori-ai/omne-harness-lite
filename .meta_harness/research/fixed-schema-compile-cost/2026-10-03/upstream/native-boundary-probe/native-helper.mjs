import * as json from "file:///data/qiwei/repos/omne-harness-lite/.worktrees/test-tiers-mutation/packages/core/content-blocks/dist/json.js";
import { installExactKeywords } from "file:///data/qiwei/repos/omne-harness-lite/.worktrees/test-tiers-mutation/packages/core/content-blocks/dist/exact-schema.js";
export const keywords = {};
installExactKeywords({ addKeyword: def => { keywords[def.keyword] = def.validate; } });
function projection(value, json) {
  if (json.LosslessNumber.is(value)) {
    const n = Number(value.source)
    return Number.isFinite(n) ? n : value.source.startsWith('-') ? -Number.MAX_VALUE : Number.MAX_VALUE
  }
  if (Array.isArray(value)) return value.map(item => projection(item, json))
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projection(item, json)]))
  return value
}
export function handoff(validator, text) {
  const read = json.readJsonStrict(text);
  if ("failed" in read) throw new Error("internal lossless handoff failed");
  const valid = validator.call({ root: read.ok }, projection(read.ok, json)) === true;
  return { valid, errors: structuredClone(validator.errors) };
}