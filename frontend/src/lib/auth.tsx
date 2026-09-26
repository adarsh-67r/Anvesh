import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, clearToken, getToken } from "./api";

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
    getToken().then((t) => {
      if (t) {
        api
          .get<{ status: string }>("/api/health")
          .then(() => {
            // Token exists and server is reachable — we'll lazy-load user info from protected endpoints
            // For now just mark as authenticated with a stub user
            setUser({ id: "", name: "", email: "" });
          })
          .catch(() => clearToken())
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
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
