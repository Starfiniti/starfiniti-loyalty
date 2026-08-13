import { NextResponse } from "next/server";
import { safeAppPath } from "@/lib/safe-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function privateRedirect(target: URL): NextResponse {
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return privateRedirect(
        new URL(safeAppPath(requestUrl.searchParams.get("next")), requestUrl),
      );
    }
  }

  const target = new URL("/login", requestUrl);
  target.searchParams.set("error", "authentication_failed");
  return privateRedirect(target);
}
