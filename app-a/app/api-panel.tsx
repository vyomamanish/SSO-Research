import { getSessionTokens } from "@/auth";

type ApiResult =
  | { ok: true; me: { subject: string; username: string; groups: string[]; audience: string } }
  | { ok: false; message: string };

async function callApi(): Promise<ApiResult> {
  const tokens = await getSessionTokens();
  try {
    const response = await fetch(`${process.env.API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${tokens?.accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, message: `The API rejected the token (HTTP ${response.status}).` };
    }
    return { ok: true, me: await response.json() };
  } catch {
    return { ok: false, message: "The API isn't reachable on port 4000." };
  }
}

export async function ApiPanel() {
  const result = await callApi();

  return (
    <section className="card">
      <p className="eyebrow">Backend API · localhost:4000/api/me</p>
      {result.ok ? (
        <>
          <h2>Token verified by the API</h2>
          <p className="muted">
            A separate service checked this login against Authentik&apos;s public keys.
          </p>
          <dl className="facts">
            <dt>Username</dt>
            <dd>{result.me.username}</dd>
            <dt>Groups</dt>
            <dd>{result.me.groups.join(", ") || "None"}</dd>
            <dt>Audience</dt>
            <dd>{result.me.audience}</dd>
          </dl>
        </>
      ) : (
        <>
          <h2>API check unavailable</h2>
          <p className="muted">{result.message}</p>
        </>
      )}
    </section>
  );
}
