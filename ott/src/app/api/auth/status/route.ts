// Kept from the current app: NavBar and the player call this for login state.
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ authenticated: false });
  return Response.json({
    authenticated: true,
    user: { name: user.name, email: user.email, role: user.role, plan: user.plan },
  });
}
