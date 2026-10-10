const EXTERNAL_OR_SPECIAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

export function joinBasePath(base: string, path: string): string {
  if (EXTERNAL_OR_SPECIAL_URL.test(path)) return path;
  const normalizedBase = (base || "/").replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  if (!normalizedPath) return normalizedBase || "/";
  if (
    normalizedBase &&
    normalizedBase !== "/" &&
    (path === normalizedBase || path.startsWith(`${normalizedBase}/`))
  ) {
    return path;
  }
  return `${normalizedBase}/${normalizedPath}`;
}

export function resolveAppAssetPath(path: string): string {
  return joinBasePath(import.meta.env.BASE_URL || "/", path);
}
