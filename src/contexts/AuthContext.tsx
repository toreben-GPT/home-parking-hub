import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../services/api";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("checking");

  const checkSession = useCallback(async () => {
    try {
      setStatus((await api.getSession()) ? "authenticated" : "unauthenticated");
    } catch {
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void checkSession();
    const expire = () => setStatus("unauthenticated");
    window.addEventListener("home-parking-hub:auth-expired", expire);
    return () => window.removeEventListener("home-parking-hub:auth-expired", expire);
  }, [checkSession]);

  const login = useCallback(async (code: string) => {
    await api.login(code);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(() => ({ status, login, logout }), [status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
