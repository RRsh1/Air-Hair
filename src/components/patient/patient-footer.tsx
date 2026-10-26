import Link from "next/link";

export function PatientFooter({ slug }: { slug: string }) {
  return (
    <footer className="mx-auto w-full max-w-md px-5 pb-8 pt-4 text-center">
      <Link href={`/c/${slug}/privacy`} className="text-[0.875rem] text-p-muted underline-offset-4 hover:underline">
        מדיניות הפרטיות של המרפאה
      </Link>
    </footer>
  );
}
