"use server";

import { redirect } from "next/navigation";
import { getSessionTokens, signIn, signOut } from "@/auth";

export async function login() {
  await signIn("authentik", { redirectTo: "/" });
}

export async function logout() {
  // Read the ID token first: signOut() deletes the cookie that holds it.
  const tokens = await getSessionTokens();
  await signOut({ redirect: false });

  // RP-initiated logout: ask Authentik to end the SSO session, then come back.
  const endSession = new URL("end-session/", process.env.AUTH_AUTHENTIK_ISSUER);
  if (tokens?.idToken) {
    endSession.searchParams.set("id_token_hint", tokens.idToken);
    endSession.searchParams.set("post_logout_redirect_uri", `${process.env.AUTH_URL}/`);
  }
  redirect(endSession.toString());
}
