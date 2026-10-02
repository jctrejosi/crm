const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export type UserProfile = {
  id: number;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  phone: string | null;
  isSuperuser: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export const authService = {
  async getProfile(): Promise<UserProfile> {
    return fetchJson<UserProfile>(`${API_BASE_URL}/auth/me`);
  },
};
