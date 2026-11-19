// Mirrors DSG 2.0's AuthContext (dsg-sso.md 6.2): adds loginWithSso, and
// logout now ends the session on the server and in Authentik.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

const STORAGE_KEY = "authSession";
const AuthContext = createContext(null);

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [loading, setLoading] = useState(Boolean(readSession()?.token));

  const persistAuth = useCallback((token, user) => {
    // Phase 1 keeps today's storage; Phase 2 moves to an HttpOnly cookie.
    const next = { token, user };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const clearAuth = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  // On load, as today: check the token with /me. A 401 clears it, which is how
  // a back-channel logout from OTT shows up here.
  useEffect(() => {
    const token = readSession()?.token;
    if (!token) return;
    axios
      .get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => persistAuth(token, data))
      .catch((error) => {
        if ([401, 403].includes(error.response?.status)) clearAuth();
      })
      .finally(() => setLoading(false));
  }, [persistAuth, clearAuth]);

  const loginWithSso = useCallback((returnTo = "/") => {
    window.location.assign(`/api/auth/oidc/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const completeSso = useCallback(
    async (code) => {
      const { data } = await axios.post("/api/auth/oidc/exchange", { code });
      persistAuth(data.token, data.user);
      return data.user;
    },
    [persistAuth],
  );

  const logout = useCallback(async () => {
    let destination = "/";
    try {
      const { data } = await axios.post("/api/auth/oidc/logout", null, {
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      destination = data.endSessionUrl;
    } catch {
      // Already signed out on the server; just clear the browser.
    }
    clearAuth();
    window.location.assign(destination);
  }, [session, clearAuth]);

  const value = useMemo(
    () => ({ token: session?.token, user: session?.user, loading, loginWithSso, completeSso, logout }),
    [session, loading, loginWithSso, completeSso, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
