import type { ContentItem } from "@/lib/journal/patient-journal";
import type { ThemeBlocks } from "@/lib/theme/patient-theme";

const typeLabel: Record<ContentItem["contentType"], string> = {
  instruction: "הוראה",
  recommendation: "המלצה",
  tip: "טיפ",
};

/**
 * The clinic's guidance for a day, from structured JSON (never HTML).
 * Variants: list (hairlines between items), cards (each on a surface), rule (accent line at the start).
 */
export function GuidanceBlock({
  config,
  items,
  title = "ההנחיות להיום",
}: {
  config: ThemeBlocks["guidance"];
  items: ContentItem[];
  title?: string;
}) {
  return (
    <section data-block="guidance" className="mx-auto w-full max-w-md px-5">
      <h2 className="p-heading text-[1.3125rem] text-gd-heading">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-gd-muted">
          המרפאה עוד לא הוסיפה הנחיות ליום הזה. בכל שאלה אפשר לפנות ישירות למרפאה.
        </p>
      ) : (
        <ul className={config.variant === "list" ? "mt-2 divide-y divide-gd-line" : "mt-3 space-y-3"}>
          {items.map((item) => (
            <li
              key={item.id}
              className={
                config.variant === "cards"
                  ? "rounded-p bg-gd-bg px-4 py-4"
                  : config.variant === "rule"
                    ? "border-s-[3px] border-gd-accent ps-4 py-1"
                    : "py-4"
              }
            >
              <p className="text-[0.8125rem] font-medium text-gd-accent">{typeLabel[item.contentType]}</p>
              <h3 className="p-heading mt-0.5 text-[1.0625rem] text-gd-heading">{item.title}</h3>
              <div className="mt-1.5 space-y-2 text-[1rem] leading-relaxed text-gd-ink">
                {item.body.blocks.map((block, index) =>
                  block.type === "text" ? (
                    <p key={index} className="whitespace-pre-line">
                      {block.text}
                    </p>
                  ) : (
                    <ul key={index} className="space-y-1.5">
                      {block.items.map((text, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span aria-hidden="true" className="mt-[0.6rem] h-[5px] w-[5px] shrink-0 rounded-full bg-gd-accent" />
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
      )}
    </section>
  );
}
