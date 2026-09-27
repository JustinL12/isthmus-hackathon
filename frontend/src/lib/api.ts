import type {
  CatalogItem,
  CatalogItemCreate,
  CatalogItemDetail,
  CatalogItemUpdate,
  CreatePlanRequest,
  Explanation,
  Plan,
  PlanSummary,
  Resource,
  SuggestRequest,
  SuggestResponse,
  Symptom,
  Template,
  TemplateRank,
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

/** Wake Render and the Databricks warehouse ahead of a /suggest call. Fire and forget. */
export function warmUp(): void {
  fetch(`${API_URL}/health?warm=true`).catch(() => {});
}

export const api = {
  /** Active items; pass true for the clinic's list, which also includes removed ones. */
  catalog: (includeInactive = false) =>
    request<CatalogItem[]>(includeInactive ? "/catalog?include_inactive=true" : "/catalog"),
  // Clinic price list. Errors: 404 unknown id, 409 name already on the list, 422 invalid input.
  createCatalogItem: (body: CatalogItemCreate) =>
    request<CatalogItemDetail>("/catalog", { method: "POST", body: JSON.stringify(body) }),
  updateCatalogItem: (id: string, body: CatalogItemUpdate) =>
    request<CatalogItemDetail>(`/catalog/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  removeCatalogItem: (id: string) => request<CatalogItemDetail>(`/catalog/${id}`, { method: "DELETE" }),
  restoreCatalogItem: (id: string) =>
    request<CatalogItemDetail>(`/catalog/${id}`, { method: "PATCH", body: JSON.stringify({ active: true }) }),
  explanations: () => request<Record<string, Explanation>>("/explanations"),
  templates: () => request<Template[]>("/templates"),
  /** This species' templates, best fit for the patient first (symptoms, age/weight/breed, what vets picked before). */
  rankTemplates: (body: SuggestRequest) =>
    request<TemplateRank[]>("/templates/rank", { method: "POST", body: JSON.stringify(body) }),
  /** Hide an AI-made template (403 for the clinic's own). */
  hideTemplate: (id: string) => request<Template>(`/templates/${id}`, { method: "DELETE" }),
  resources: () => request<Resource[]>("/resources"),
  symptoms: () => request<Symptom[]>("/symptoms"),
  /** Adds a symptom to the clinic list, or returns the existing one with the same name. */
  addSymptom: (label: string) => request<Symptom>("/symptoms", { method: "POST", body: JSON.stringify({ label }) }),
  suggest: (body: SuggestRequest) => request<SuggestResponse>("/suggest", { method: "POST", body: JSON.stringify(body) }),

  createPlan: (body: CreatePlanRequest) => request<Plan>("/plans", { method: "POST", body: JSON.stringify(body) }),
  listPlans: () => request<PlanSummary[]>("/plans"),
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
