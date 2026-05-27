import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import supabase from "./supabaseClient";

/**
 * ProtectedRoute
 * - Protects dashboard/form pages based on Supabase auth session.
 * - Does NOT block public login/reset pages.
 * - Avoids redirect loops on refresh by reading the real Supabase session.
 */
export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  const redirectTarget = useMemo(() => "/", []);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        // Fetch current persisted Supabase session (survives refresh)
        const { data } = await supabase.auth.getSession();
        const authed = !!data.session?.user;

        if (isMounted) {
          setIsAuthed(authed);
          setLoading(false);
        }
      } catch (err) {
        console.log("ProtectedRoute: getSession failed:", err);
        if (isMounted) {
          setIsAuthed(false);
          setLoading(false);
        }
      }
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // While checking session, avoid instant redirects/loops.
  if (loading) return null;

  if (!isAuthed) {
    console.log("ProtectedRoute: not authenticated -> redirect", { redirectTarget });
    return <Navigate to={redirectTarget} replace />;
  }

  console.log("ProtectedRoute: authenticated -> allow", { path: window.location.pathname });
  return children;
}

