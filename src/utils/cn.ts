/**
 * Utility for merging class names, replacing `clsx` / `classnames`.
 * Filters out falsy values and joins the rest with a space.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
