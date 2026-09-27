import type { Plan } from "./types";

// Mochi/Alex demo from the project plan. Mirrors what POST /api/plans builds from the
// "vomiting-senior-cat" template (backend/app/data), so /plan/demo works with no backend.
// Full estimate $780; essentials $360 (the only items ticked to start, as in real plans); Alex's
// budget $400. Prices are samples.

export const DEMO_PLAN_ID = "demo";

export const samplePlan: Plan = {
  id: DEMO_PLAN_ID,
  pet: { name: "Mochi", species: "cat", age_years: 12, breed: "Domestic Shorthair", weight_lbs: 9.5, reason: "Vomiting for 2 days" },
  owner_name: "Alex",
  budget: 400,
  payment_choice: "pay_today",
  status: "draft",
  share_token: null,
  symptoms: ["vomiting", "not-eating"],
  notes: null,
  owner_email: null,
  source: "template",
  suggested: [],
  items: [
    {
      id: "demo-exam",
      catalog_id: "exam",
      name: "Sick-visit exam",
      price: 75,
      group: "essential",
      selected: true,
      explanation: {
        what: "The vet checks your pet from nose to tail.",
        why: "Tells the vet how sick your pet is and what to check next.",
        if_postponed: "Needed for any treatment today.",
      },
    },
    {
      id: "demo-antiemetic-inj",
      catalog_id: "antiemetic-inj",
      name: "Anti-nausea injection",
      price: 55,
      group: "essential",
      selected: true,
      explanation: {
        what: "A shot that stops nausea and vomiting for about 24 hours.",
        why: "Helps your pet keep food and water down and feel better fast.",
        if_postponed: "Vomiting may continue and dehydration can get worse.",
      },
    },
    {
      id: "demo-sq-fluids",
      catalog_id: "sq-fluids",
      name: "Fluids under the skin",
      price: 60,
      group: "essential",
      selected: true,
      explanation: {
        what: "Fluids given under the skin to rehydrate.",
        why: "Vomiting pets lose water quickly, especially older cats.",
        if_postponed: "Dehydration can make your pet weaker and harder to treat.",
      },
    },
    {
      id: "demo-blood-panel",
      catalog_id: "blood-panel",
      name: "Blood panel",
      price: 170,
      group: "essential",
      selected: true,
      explanation: {
        what: "Blood tests that check organs like the kidneys and liver, plus blood cells.",
        why: "Finds common causes of vomiting in older cats, like kidney disease.",
        if_postponed: "The vet may miss an underlying problem that changes treatment.",
      },
    },
    {
      id: "demo-xrays-abd",
      catalog_id: "xrays-abd",
      name: "Belly X-rays",
      price: 250,
      group: "soon",
      selected: false,
      explanation: {
        what: "Pictures of the belly.",
        why: "Looks for blockages or swallowed objects.",
        if_postponed: "Often fine to do at a recheck if vomiting improves. Come back sooner if it gets worse.",
      },
    },
    {
      id: "demo-urinalysis",
      catalog_id: "urinalysis",
      name: "Urine test",
      price: 70,
      group: "soon",
      selected: false,
      explanation: {
        what: "A test of a urine sample.",
        why: "Adds detail to the blood panel on kidney health.",
        if_postponed: "Usually fine at a recheck within 1–2 weeks.",
      },
    },
    {
      id: "demo-t4",
      catalog_id: "t4",
      name: "Thyroid test",
      price: 65,
      group: "optional",
      selected: false,
      explanation: {
        what: "Measures thyroid hormone.",
        why: "An overactive thyroid is common in older cats and can cause vomiting.",
        if_postponed: "Usually fine to check at the next visit.",
      },
    },
    {
      id: "demo-rx-diet",
      catalog_id: "rx-diet",
      name: "Prescription diet (1 bag)",
      price: 35,
      group: "optional",
      selected: false,
      explanation: {
        what: "A gentle food that is easy on the stomach.",
        why: "Can help the stomach settle for a few days.",
        if_postponed: "Your vet can suggest a bland diet at home instead.",
      },
    },
  ],
};
