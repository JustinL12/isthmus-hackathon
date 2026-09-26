import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Isthmus Care</h1>
      <p className="text-lg">
        Turn a confusing vet estimate into a clear plan you can afford: what&apos;s essential today, what can
        wait, and what&apos;s optional.
      </p>
      <Link href="/setup" className="w-fit rounded-lg bg-black px-5 py-3 text-white">
        Start a visit plan (vet)
      </Link>
    </main>
  );
}
