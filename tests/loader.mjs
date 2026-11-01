import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith(".") || specifier.startsWith("/")) &&
    context.parentURL
  ) {
    const url = new URL(specifier, context.parentURL);
    if (
      !existsSync(fileURLToPath(url)) &&
      existsSync(fileURLToPath(url) + ".ts")
    )
      return {
        url: pathToFileURL(fileURLToPath(url) + ".ts").href,
        shortCircuit: true,
      };
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  // UI translation is the sole source-module stub; it has no framing/timing logic.
  if (url.endsWith("/src/i18n/i18n.ts"))
    return {
      format: "module",
      source: "export function translate(key) { return key; }",
      shortCircuit: true,
    };
  return nextLoad(url, context);
}
