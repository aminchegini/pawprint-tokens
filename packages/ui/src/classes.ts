/** Join class names, skipping empty ones. */
export function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
