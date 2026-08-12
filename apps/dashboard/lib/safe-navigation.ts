export function safeAppPath(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.startsWith("/login")
  ) {
    return fallback;
  }
  return value;
}
