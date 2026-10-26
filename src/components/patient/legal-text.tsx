import type { LegalDocument } from "@/lib/legal/documents";

/** A clinic document: plain text split into paragraphs (never HTML), or a link to its PDF. */
export function LegalText({ slug, document }: { slug: string; document: LegalDocument }) {
  if (document.format === "file") {
    return (
      <a
        href={`/c/${slug}/legal/${document.id}`}
        target="_blank"
        rel="noopener"
        className="flex items-center justify-between rounded-p border border-p-line bg-p-surface px-4 py-4 text-[1.0625rem] font-medium text-p-accent"
      >
        <span>פתיחת המסמך המלא</span>
        <span className="text-[0.875rem] font-normal text-p-muted">קובץ PDF</span>
      </a>
    );
  }

  // A short first line followed by more text reads as the paragraph's heading.
  const paragraphs = (document.bodyText ?? "").split(/\n{2,}/).map((paragraph) => {
    const [first, ...rest] = paragraph.split("\n");
    return rest.length > 0 && first.length <= 60 ? { heading: first, text: rest.join("\n") } : { heading: null, text: paragraph };
  });
  return (
    <div className="space-y-4 text-[1rem] leading-relaxed text-p-ink/85">
      {paragraphs.map((paragraph, index) => (
        <div key={index}>
          {paragraph.heading && <h3 className="font-semibold text-p-ink">{paragraph.heading}</h3>}
          <p className="whitespace-pre-line">{paragraph.text}</p>
        </div>
      ))}
    </div>
  );
}
