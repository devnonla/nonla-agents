/**
 * useAuth — authentication state hook.
 *
 * Checks localStorage for auth token, verifies via /api/auth/me,
 * and provides user info + logout function.
 */

import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getAuthToken } from "src/common/api";
import type { User } from "src/common/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth(): AuthState & { logout: () => void } {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setState({ user: null, isLoading: false, isAuthenticated: false });
      // Redirect to login if not on login page
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
      return;
    }

    // Verify token
    apiClient
      .get<User>("/api/auth/me")
      .then((user) => {
        setState({ user, isLoading: false, isAuthenticated: true });
      })
      .catch(() => {
        clearAuthToken();
        setState({ user: null, isLoading: false, isAuthenticated: false });
        if (location.pathname !== "/login") {
          navigate("/login", { replace: true });
        }
      });
  }, [navigate, location.pathname]);

  const logout = useCallback(() => {
    clearAuthToken();
    setState({ user: null, isLoading: false, isAuthenticated: false });
    navigate("/login", { replace: true });
  }, [navigate]);

  return { ...state, logout };
}
