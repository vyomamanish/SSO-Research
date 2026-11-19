// OIDC client for Authentik (dsg-sso.md 4.4). openid-client and jose are ESM
// packages, so this CommonJS file loads them with dynamic import().
let configPromise;
const oidc = () => import("openid-client");
const joseLib = () => import("jose");

async function getOidcConfig() {
  if (!configPromise) {
    const client = await oidc();
    const issuer = process.env.OIDC_ISSUER_URL;
    configPromise = client
      .discovery(
        new URL(issuer),
        process.env.OIDC_CLIENT_ID,
        process.env.OIDC_CLIENT_SECRET,
        undefined,
        // Plain HTTP is only allowed for a local Authentik.
        issuer.startsWith("http://localhost") ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((error) => {
        configPromise = undefined; // retry on the next request
        throw error;
      });
  }
  return configPromise;
}

/** Builds the authorize URL and the values the state cookie must remember. */
async function buildAuthUrl() {
  const client = await oidc();
  const config = await getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: process.env.OIDC_REDIRECT_URI,
    scope: process.env.OIDC_SCOPES,
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, state, nonce, codeVerifier };
}

let jwks;
async function verifyAuthentikJwt(token, options = {}) {
  const { createRemoteJWKSet, jwtVerify } = await joseLib();
  jwks ??= createRemoteJWKSet(new URL("jwks/", process.env.OIDC_ISSUER_URL)); // cached, refetches on unknown kid
  const { payload } = await jwtVerify(token, jwks, {
    issuer: process.env.OIDC_ISSUER_URL, // exact, including the trailing slash
    audience: process.env.OIDC_CLIENT_ID,
    algorithms: ["RS256"],
    clockTolerance: 30,
    ...options,
  });
  return payload;
}

/** Exchanges the code and returns verified ID token claims. */
async function handleCallback(currentUrl, { codeVerifier, state, nonce }) {
  const client = await oidc();
  const config = await getOidcConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });
  // openid-client checks iss, aud, exp and nonce; the signature is checked here.
  await verifyAuthentikJwt(tokens.id_token);
  return { claims: tokens.claims(), tokens };
}

async function endSessionUrl(idTokenHint) {
  const client = await oidc();
  const params = { post_logout_redirect_uri: process.env.OIDC_POST_LOGOUT_REDIRECT_URI };
  if (idTokenHint) params.id_token_hint = idTokenHint;
  return client.buildEndSessionUrl(await getOidcConfig(), params).href;
}

module.exports = { getOidcConfig, buildAuthUrl, handleCallback, endSessionUrl, verifyAuthentikJwt };
