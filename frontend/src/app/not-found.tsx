import Link from "next/link";
import { AppHeader, StatusPage } from "@/components/AppChrome";
import { secondaryButton } from "@/lib/ui";

export default function NotFound() {
  return (
    <StatusPage header={<AppHeader />}>
      <h1 className="text-2xl font-extrabold tracking-tight">Page not found</h1>
      <p className="text-muted">This page doesn&apos;t exist. Check the link, or start from the home page.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={secondaryButton}>
          Go home
        </Link>
        <Link href="/setup?new=1" className={secondaryButton}>
          Start a visit plan
        </Link>
      </div>
    </StatusPage>
  );
}
