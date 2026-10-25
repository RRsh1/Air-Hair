export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <p dir="ltr" className={`inline-block text-[1.375rem] font-bold tracking-tight text-ink ${className}`}>
      Hair<span className="font-light text-petrol">&amp;</span>Air
    </p>
  );
}
