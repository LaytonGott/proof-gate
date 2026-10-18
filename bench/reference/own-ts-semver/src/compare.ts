export function parse(version: string): { core: number[]; pre: string[] } {
  const [withoutBuild] = version.split('+');
  const dash = withoutBuild.indexOf('-');
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const pre = dash === -1 ? '' : withoutBuild.slice(dash + 1);
  return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : [] };
}

const isNum = (s: string) => /^\d+$/.test(s);

export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1;
  if (!pa.pre.length || !pb.pre.length) return pa.pre.length === pb.pre.length ? 0 : pa.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i], y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (isNum(x) && isNum(y)) return Number(x) < Number(y) ? -1 : 1;
    if (isNum(x)) return -1;
    if (isNum(y)) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function sortVersions(versions: string[]): string[] {
  return [...versions].sort(compareVersions);
}
