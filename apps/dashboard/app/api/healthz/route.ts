import { runtimeIsReady } from "@/lib/server/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(): Promise<Response> {
  try {
    if (await runtimeIsReady()) {
      return new Response("ok\n", { status: 200, headers });
    }
  } catch {
    // A public readiness response must not disclose configuration, topology,
    // migration, credential, or key-pool failure details.
  }
  return new Response("unavailable\n", { status: 503, headers });
}
