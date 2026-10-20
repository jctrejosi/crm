const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3100";

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

  /** Inicia sesión; el backend deja el JWT en una cookie httpOnly. */
  async login(identifier: string, password: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    if (!response.ok) {
      let message = "Usuario o contraseña incorrectos";
      try {
        const data = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(data?.message)) message = data.message.join(". ");
        else if (typeof data?.message === "string") message = data.message;
      } catch {
        /* respuesta sin JSON */
      }
      if (response.status === 429) {
        message = "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
      }
      throw new Error(message);
    }
  },

  /** Cierra la sesión y limpia las cookies del backend. */
  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      /* sin red: el estado local se limpia igual */
    }
  },
};
