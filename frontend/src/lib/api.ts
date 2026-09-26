import type {
  CatalogItem,
  CreatePlanRequest,
  Explanation,
  Plan,
  Resource,
  SuggestRequest,
  SuggestResponse,
  Symptom,
  Template,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new ApiError(`${init?.method ?? "GET"} ${path} failed: ${res.status}`, res.status);
  return res.json();
}

export const api = {
  catalog: () => request<CatalogItem[]>("/catalog"),
  explanations: () => request<Record<string, Explanation>>("/explanations"),
  templates: () => request<Template[]>("/templates"),
  resources: () => request<Resource[]>("/resources"),
  symptoms: () => request<Symptom[]>("/symptoms"),
  suggest: (body: SuggestRequest) => request<SuggestResponse>("/suggest", { method: "POST", body: JSON.stringify(body) }),

  createPlan: (body: CreatePlanRequest) => request<Plan>("/plans", { method: "POST", body: JSON.stringify(body) }),
  getPlan: (id: string) => request<Plan>(`/plans/${id}`),
  updatePlan: (id: string, body: Partial<Pick<Plan, "budget" | "payment_choice" | "items" | "owner_email">>) =>
    request<Plan>(`/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  agreePlan: (id: string) => request<Plan>(`/plans/${id}/agree`, { method: "POST" }),
  emailPlan: (id: string, email: string) =>
    request<{ sent: boolean }>(`/plans/${id}/email`, { method: "POST", body: JSON.stringify({ email }) }),
  getSharedPlan: (token: string) => request<Plan>(`/share/${token}`),
  /** Use as a link href ("Download PDF"), not with fetch. */
  sharedPdfUrl: (token: string) => `${API_URL}/api/share/${token}/pdf`,
};
