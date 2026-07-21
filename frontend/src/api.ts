async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(path, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  if (resp.status === 401) {
    throw new AuthError();
  }
  if (!resp.ok) {
    let detail = `Ошибка ${resp.status}`;
    try {
      const data = await resp.json();
      if (data.detail) detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json();
}

export class AuthError extends Error {
  constructor() {
    super("Не авторизован");
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<T>(path, { method: "POST", body: form });
  },
};
