// Liveness probe for the UI itself. Mirrors the backend convention: /health
// is pure liveness and does NOT fan out to backend services — a broken
// backend must surface as a broken flow, not as a dead UI pod.
export function GET() {
  return Response.json({ status: "ok" });
}
