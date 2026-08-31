export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export function slugify(value: string, separator: "-" | "_" = "-"): string {
  const collapsed = stripDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator);
  const trimRe = separator === "_" ? /^_+|_+$/g : /^-+|-+$/g;
  const collapseRe = separator === "_" ? /_+/g : /-+/g;
  return collapsed.replace(trimRe, "").replace(collapseRe, separator);
}

export function normalizeSlugInput(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
}
