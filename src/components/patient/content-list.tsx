import type { ContentItem } from "@/lib/journal/patient-journal";

const typeLabel: Record<ContentItem["contentType"], string> = {
  instruction: "הוראה",
  recommendation: "המלצה",
  tip: "טיפ",
};

/** The clinic's guidance for a day, rendered from structured JSON as plain text. */
export function ContentList({ items }: { items: ContentItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-p border border-dashed border-p-line px-4 py-5 text-[0.9375rem] leading-relaxed text-p-muted">
        המרפאה עוד לא הוסיפה הנחיות ליום הזה. בכל שאלה אפשר לפנות ישירות למרפאה.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="p-block py-4">
          <p className="text-[0.8125rem] font-medium text-p-accent">{typeLabel[item.contentType]}</p>
          <h3 className="mt-1 text-[1.0625rem] font-semibold">{item.title}</h3>
          <div className="mt-2 space-y-2 text-[1rem] leading-relaxed text-p-ink/85">
            {item.body.blocks.map((block, index) =>
              block.type === "text" ? (
                <p key={index} className="whitespace-pre-line">
                  {block.text}
                </p>
              ) : (
                <ul key={index} className="space-y-1.5">
                  {block.items.map((text, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-p-accent" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
