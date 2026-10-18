// Compares two semantic version strings ("1.4.2", "2.0.0-rc.1", "1.0.0+build.5").
// Returns a negative number if a < b, 0 if they have equal precedence, positive if a > b.
// Precedence follows semver.org section 11.

export function parse(version: string): { core: string[]; pre: string[] } {
  const [withoutBuild] = version.split('+');
  const [core, pre] = withoutBuild.split('-');
  return { core: core.split('.'), pre: pre ? pre.split('.') : [] };
}

export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1;
  }
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  return pa.pre.join('.') < pb.pre.join('.') ? -1 : 1;
}

export function sortVersions(versions: string[]): string[] {
  return [...versions].sort(compareVersions);
}
