import Link from "next/link";
import { ChromaticLabel } from "@/components/ChromaticLabel";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Isthmus</h1>
      <p className="text-lg">
        Turn a confusing vet estimate into a clear plan you can afford: what&apos;s essential today, what can
        wait, and what&apos;s optional.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/setup" className="w-fit rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2">
          <ChromaticLabel>Start a visit plan (vet)</ChromaticLabel>
        </Link>
        <Link href="/plan/demo" className="w-fit rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2">
          <ChromaticLabel texture="pine">Open the Mochi demo</ChromaticLabel>
        </Link>
      </div>
    </main>
  );
}
