import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { router } from "expo-router";
import { api, setToken, clearToken, getToken, setUnauthorizedHandler } from "./api";

type User = { id: string; name: string; email: string };

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace("/(auth)/login");
    });
    getToken().then(async (t) => {
      if (t) {
        try {
          setUser(await api.get<User>("/api/auth/me"));
        } catch {
          // A 401 already cleared the token; any other error (offline, server waking up) keeps the session.
          if (await getToken()) setUser({ id: "", name: "", email: "" });
        }
      }
      setLoading(false);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/api/auth/login", {
      email,
      password,
    });
    await setToken(res.token);
    setUser(res.user);
  };

  const register = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/api/auth/register", {
      email,
      password,
    });
    await setToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
