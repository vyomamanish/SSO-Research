import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = 4000;
const ISSUER = "http://localhost:9000/application/o/ott-demo/";
const CLIENT_ID = "ott-demo";

// Fetches Authentik's public keys on demand and caches them. The API never
// needs a shared secret or a call to Authentik per request.
const jwks = createRemoteJWKSet(new URL("jwks/", ISSUER));

async function requireToken(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "missing_bearer_token" });
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: CLIENT_ID,
      algorithms: ["RS256"],
    });
    req.claims = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: "invalid_token", code: error.code });
  }
}

const app = express();

app.get("/api/me", requireToken, (req, res) => {
  const { sub, preferred_username, email, groups = [], aud } = req.claims;
  res.json({ subject: sub, username: preferred_username, email, groups, audience: aud });
});

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
