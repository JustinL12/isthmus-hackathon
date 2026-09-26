"use client";

// "Can't cover it today?" — lower-cost Madison options.
// TODO: map (Leaflet + OpenStreetMap), verify contact info the week of the event.

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Resource } from "@/lib/types";

export default function ResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [resources, setResources] = useState<Resource[]>([]);

  useEffect(() => {
    api.resources().then(setResources);
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-8">
      <h1 className="text-2xl font-bold">Can&apos;t cover it today?</h1>
      <p>These Madison options may be able to help. Ask your vet which fits your pet.</p>
      <ul className="space-y-3">
        {resources.map((r) => (
          <li key={r.id} className="rounded-lg border p-4">
            <h2 className="font-semibold">
              {r.url ? <a href={r.url} className="underline" target="_blank" rel="noreferrer">{r.name}</a> : r.name}
            </h2>
            <p className="text-sm">{r.offers}</p>
            {r.eligibility && <p className="text-sm text-gray-600">{r.eligibility}</p>}
          </li>
        ))}
      </ul>
      <Link href={`/plan/${id}`} className="underline">Back to plan</Link>
    </main>
  );
}
