"use client";

// Vet setup step 1: pick a visit template and enter pet/owner basics.
// TODO (stretch): "Upload estimate PDF" -> POST /api/ai/parse-estimate.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Template } from "@/lib/types";

export default function SetupPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("vomiting-senior-cat");
  const [petName, setPetName] = useState("Mochi");
  const [age, setAge] = useState("12");
  const [ownerName, setOwnerName] = useState("Alex");
  const [budget, setBudget] = useState("400");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.templates().then(setTemplates).catch((e) => setError(String(e)));
  }, []);

  async function create() {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    try {
      const plan = await api.createPlan({
        template_id: templateId,
        pet: { name: petName, species: template.species, age_years: Number(age) || null, reason: template.name },
        owner_name: ownerName,
        budget: Number(budget) || null,
      });
      router.push(`/plan/${plan.id}/arrange`);
    } catch (e) {
      setError(String(e));
    }
  }

  const input = "w-full rounded-lg border px-3 py-2";
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-8">
      <h1 className="text-2xl font-bold">New visit plan</h1>
      {error && <p className="text-red-600">{error} (is the backend running?)</p>}
      <label className="block">
        Visit template
        <select className={input} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="block">Pet name<input className={input} value={petName} onChange={(e) => setPetName(e.target.value)} /></label>
      <label className="block">Age (years)<input className={input} value={age} onChange={(e) => setAge(e.target.value)} /></label>
      <label className="block">Owner name<input className={input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} /></label>
      <label className="block">Owner budget today ($, optional)<input className={input} value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      <button onClick={create} className="rounded-lg bg-black px-5 py-3 text-white">Build plan</button>
    </main>
  );
}
