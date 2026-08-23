export type Rfq = { id: string; title: string; status: string; updatedAt: string; nextStep: string; language: string; product: string; materials: string; quantity: string; destination: string; targetPrice: string };
export type Invoice = { id: string; rfqId: string; amount: number; currency: string; dueDate: string; status: string };

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("The Atelix service is unavailable. Check your connection and try again.", 0);
  }

  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }

  if (body === null && response.status !== 204) {
    throw new ApiError("The Atelix service returned an invalid response.", response.status);
  }

  if (path === "/api/auth/login" && typeof window !== "undefined") {
    sessionStorage.setItem("atelix.user", JSON.stringify(body));
  }

  return body as T;
}
