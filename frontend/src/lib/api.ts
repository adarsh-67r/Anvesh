import { Linking, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as DocumentPicker from "expo-document-picker";

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

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 && token) {
    await clearToken();
    onUnauthorized?.();
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `${res.status}`);
  }
  return res.json();
}

/**
 * File uploads on the phone. The app's global fetch (expo/fetch) rejects React Native's
 * `{ uri, name, type }` FormData parts ("Unsupported FormDataPart implementation");
 * React Native's own XMLHttpRequest streams those local files natively.
 */
async function uploadNative<T>(path: string, form: FormData): Promise<T> {
  const token = await getToken();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      if (xhr.status === 401 && token) {
        clearToken().then(() => onUnauthorized?.());
      }
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(xhr.responseText || `${xhr.status}`));
      try { resolve(JSON.parse(xhr.responseText) as T); } catch (e) { reject(e); }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 120000;
    xhr.send(form);
  });
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) =>
    Platform.OS === "web" ? request<T>(path, { method: "POST", body: form }) : uploadNative<T>(path, form),
};

export type Attachment = { id: string; filename: string; content_type: string; size?: number };

export const AI_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf", "text/plain"];
export const GROUP_FILE_TYPES = [
  ...AI_FILE_TYPES,
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export type PickedFile = { uri: string; name: string; mimeType: string; size?: number; file?: File };

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function pickFile(types: string[], maxBytes = MAX_FILE_BYTES): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, base64: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (a.size && a.size > maxBytes) throw new Error(`File is too large (max ${Math.round(maxBytes / 1048576)} MB).`);
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream", size: a.size, file: a.file };
}

export async function uploadAttachment(picked: PickedFile, groupId?: string): Promise<Attachment> {
  const form = new FormData();
  if (picked.file) {
    form.append("file", picked.file, picked.name);
  } else {
    // React Native's FormData accepts a {uri, name, type} descriptor for local files.
    form.append("file", { uri: picked.uri, name: picked.name, type: picked.mimeType } as unknown as Blob);
  }
  if (groupId) form.append("group_id", groupId);
  return api.upload<Attachment>("/api/attachments", form);
}

export async function openAttachment(id: string) {
  const { url } = await api.post<{ url: string }>(`/api/attachments/${id}/link`);
  await Linking.openURL(url);
}

export type StudyStatus = { study_minutes: number; required_minutes: number; unlocked: boolean };

export function logEvent(event_type: string, skill_id = "general", context?: Record<string, unknown>) {
  api.post("/api/recommend/events", { event_type, skill_id, context }).catch(() => {});
}
