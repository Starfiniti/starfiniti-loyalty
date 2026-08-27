import { handleScimRequest } from "@/lib/server/scim-http";

export const runtime = "nodejs";
export const maxDuration = 15;

type Context = Readonly<{
  params: Promise<{ endpointId: string; resource: string[] }>;
}>;

export function GET(request: Request, context: Context): Promise<Response> {
  return handleScimRequest(request, context);
}

export function POST(request: Request, context: Context): Promise<Response> {
  return handleScimRequest(request, context);
}

export function PUT(request: Request, context: Context): Promise<Response> {
  return handleScimRequest(request, context);
}

export function PATCH(request: Request, context: Context): Promise<Response> {
  return handleScimRequest(request, context);
}

export function DELETE(request: Request, context: Context): Promise<Response> {
  return handleScimRequest(request, context);
}
