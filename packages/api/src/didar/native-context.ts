// Server-only, never populated from request JSON or headers.
export const nativeActors = new WeakMap<object, any>();
export function nativeUser(req: object) {
  return nativeActors.get(req);
}
