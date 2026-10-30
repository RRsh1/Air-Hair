import Link from "next/link";

export function PatientFooter({ slug }: { slug: string }) {
  return (
    <footer data-block="footer" className="mx-auto w-full max-w-md px-5 pb-10 pt-8">
      <Link href={`/c/${slug}/privacy`} className="text-[0.875rem] text-ft-ink underline-offset-4 hover:underline">
        מדיניות הפרטיות של המרפאה
      </Link>
    </footer>
  );
}
