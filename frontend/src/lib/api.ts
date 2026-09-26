import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000");

const TOKEN_KEY = "auth_token";

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (Platform.OS === "web") {
    try { cachedToken = localStorage.getItem(TOKEN_KEY); } catch {}
  } else {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  }
  return cachedToken;
}

export async function setToken(token: string) {
  cachedToken = token;
  if (Platform.OS === "web") {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function clearToken() {
  cachedToken = null;
  if (Platform.OS === "web") {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
