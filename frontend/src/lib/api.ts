import type { Pet, Plan, Resource, Template } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  templates: () => request<Template[]>("/templates"),
  resources: () => request<Resource[]>("/resources"),

  createPlan: (body: { template_id: string; pet: Pet; owner_name: string; budget: number | null }) =>
    request<Plan>("/plans", { method: "POST", body: JSON.stringify(body) }),
  getPlan: (id: string) => request<Plan>(`/plans/${id}`),
  updatePlan: (id: string, body: Partial<Pick<Plan, "budget" | "payment_choice" | "items">>) =>
    request<Plan>(`/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  agreePlan: (id: string) => request<Plan>(`/plans/${id}/agree`, { method: "POST" }),
  getSharedPlan: (token: string) => request<Plan>(`/share/${token}`),
};
