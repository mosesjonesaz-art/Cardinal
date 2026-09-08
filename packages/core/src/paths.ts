/** Immutable dot-path get/set used by the override system. Paths look like "party.members.0.currentHp". */

export function getAtPath(obj: unknown, path: string): unknown {
  const parts = splitPath(path);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setAtPath<T>(obj: T, path: string, value: unknown): T {
  const parts = splitPath(path);
  if (parts.length === 0) throw new Error("Empty path");
  return setRec(obj, parts, 0, value) as T;
}

function setRec(node: unknown, parts: string[], i: number, value: unknown): unknown {
  const key = parts[i] as string;
  if (i === parts.length - 1) {
    if (Array.isArray(node)) {
      const idx = Number(key);
      if (!Number.isInteger(idx)) throw new Error(`Array index expected at "${parts.slice(0, i + 1).join(".")}"`);
      const copy = [...node];
      copy[idx] = value;
      return copy;
    }
    if (node === null || typeof node !== "object") throw new Error(`Cannot set "${key}" on a non-object`);
    return { ...(node as Record<string, unknown>), [key]: value };
  }
  if (Array.isArray(node)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= node.length)
      throw new Error(`Array index out of range at "${parts.slice(0, i + 1).join(".")}"`);
    const copy = [...node];
    copy[idx] = setRec(node[idx], parts, i + 1, value);
    return copy;
  }
  if (node === null || typeof node !== "object") throw new Error(`Path "${parts.slice(0, i + 1).join(".")}" does not exist`);
  const rec = node as Record<string, unknown>;
  if (!(key in rec)) throw new Error(`Path "${parts.slice(0, i + 1).join(".")}" does not exist`);
  return { ...rec, [key]: setRec(rec[key], parts, i + 1, value) };
}

export function splitPath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((p) => p.length > 0);
}
