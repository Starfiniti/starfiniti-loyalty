export function safeAppPath(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.startsWith("/login")
  ) {
    return fallback;
  }
  return value;
}
