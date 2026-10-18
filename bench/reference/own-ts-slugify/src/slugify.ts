export function slugify(title: string, maxLength = 60): string {
  const s = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length <= maxLength) return s;
  const cut = s.slice(0, maxLength + 1).lastIndexOf('-');
  return (cut > 0 ? s.slice(0, cut) : s.slice(0, maxLength)).replace(/-+$/, '');
}
