// Express 5 (path-to-regexp@6) types req.params/req.query values as
// string | string[] | undefined because routes *could* use repeating
// segments — none of ours do, so these are always single values at
// runtime. Coerce here instead of casting at every call site.
export function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
