// Server only (route handlers): the website talks to the proof API Lambda like any other client,
// adding the secret key on the server so the browser never sees it.

const TIMEOUT_MS = 25_000;

export async function callProofApi(path: string, init: { method: "GET" | "POST"; body?: string }): Promise<Response> {
  const baseUrl = process.env.PROOF_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.PROOF_API_KEY;
  if (!baseUrl || !apiKey) {
    console.error("PROOF_API_URL or PROOF_API_KEY is not set.");
    return Response.json({ error: "The proof service is not configured." }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: { "x-api-key": apiKey, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = await upstream.json().catch(() => ({ error: "The proof service sent an unreadable reply." }));
    return Response.json(payload, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("proof api call failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not reach the proof service." }, { status: 502 });
  }
}
