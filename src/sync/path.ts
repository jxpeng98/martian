export function pathnameFromRef(ref: string): string {
  try {
    return new URL(ref).pathname;
  } catch {
    return ref;
  }
}

export function basename(pathname: string): string {
  return pathname.slice(pathname.lastIndexOf('/') + 1);
}

export function extension(pathname: string): string {
  const name = basename(pathname);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}
