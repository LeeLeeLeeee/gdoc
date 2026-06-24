/**
 * Flags in `args` (tokens starting with `--`) that aren't in `allowed`. Lets the CLI
 * reject typos like `--dr-run` instead of silently ignoring them (which would run a
 * real upload). Positional args are never returned.
 */
export function unknownFlags(args: string[], allowed: string[]): string[] {
  return args.filter((a) => a.startsWith('--') && !allowed.includes(a));
}
