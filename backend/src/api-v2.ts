export async function handleApiV2Request(
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/api/version") {
    return Response.json({ version: 2 });
  }
  return null;
}
