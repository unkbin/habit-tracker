import { Navigate, Outlet, useLocation } from "react-router";
import { FullPageSpinner } from "../components/ui/Spinner";
import { useAuth } from "./AuthProvider";

/** Logged-in pages. Anyone else goes to /login and comes back afterwards. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/**
 * Login, signup and password pages. Logged-in users go to the app: back to the page that sent
 * them to log in, if there was one.
 */
export function RequireAnonymous() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from?.startsWith("/") ? from : "/"} replace />;
  }
  return <Outlet />;
}
