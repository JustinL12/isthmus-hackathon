"use client";

import { useEffect, useRef, useState } from "react";
import { card, focusRing, inputBase, sectionLabel } from "@/lib/ui";

export interface ChatMessage {
  from: "student" | "owner";
  text: string;
}

const STARTERS = ["What brings you in today?"];

/** Chat with the pet owner. Answers come from the stored case only (see backend practice.py). */
export function OwnerChat({
  petName,
  messages,
  busy,
  disabled,
  onAsk,
}: {
  petName: string;
  messages: ChatMessage[];
  busy: boolean;
  disabled?: boolean;
  onAsk: (question: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, busy]);

  function send(text: string) {
    const q = text.trim();
    if (!q || busy || disabled) return;
    onAsk(q);
    setDraft("");
  }

  return (
    <section aria-label="Talk to the owner" className={`${card} flex min-h-[28rem] flex-col p-4 lg:h-[calc(100vh-11rem)]`}>
      <h2 className={sectionLabel}>Talk to {petName}&apos;s owner</h2>
      <p className="mt-1 text-xs text-muted">
        The owner only knows what&apos;s in the case record. Things they haven&apos;t noticed come back as &ldquo;nothing
        out of the ordinary&rdquo;.
      </p>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && (
          <p className="rounded-xl bg-study-soft/60 p-3 text-sm text-study-deep">
            Start with an open question, then narrow it down. Every answer you get shows up under Findings.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "student" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                m.from === "student" ? "rounded-br-sm bg-study text-white" : "rounded-bl-sm bg-cream text-ink"
              }`}
            >
              <span className="sr-only">{m.from === "student" ? "You: " : "Owner: "}</span>
              {m.text}
            </p>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <p className="rounded-2xl rounded-bl-sm bg-cream px-3.5 py-2 text-sm text-muted">
              <span className="animate-pulse">Owner is thinking…</span>
            </p>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || disabled}
            onClick={() => send(s)}
            className={`rounded-full border border-study/25 bg-white px-3 py-1 text-xs text-study transition-colors hover:bg-study-soft disabled:opacity-50 ${focusRing}`}
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={400}
          disabled={disabled}
          aria-label="Ask the owner a question"
          placeholder="Ask the owner a question…"
          className={`${inputBase} px-3 focus:border-study focus:ring-study/20`}
        />
        <button
          type="submit"
          disabled={busy || disabled || !draft.trim()}
          className={`shrink-0 rounded-xl bg-study px-4 font-semibold text-white transition-colors hover:bg-study-deep disabled:opacity-50 ${focusRing}`}
        >
          Ask
        </button>
      </form>
    </section>
  );
}
