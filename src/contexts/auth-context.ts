import { createContext, useContext } from "react";

export interface AuthContextValue {
  status: "checking" | "authenticated" | "unauthenticated";
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
