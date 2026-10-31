import type { Config } from "@puckeditor/core";

/**
 * Spike: three blocks of the planned landing builder, to test Puck under our constraints.
 *  - Designer-made variants instead of free styling (radio "variant").
 *  - Hard limits: character counts in field labels/validation, FAQ 3–8 items.
 *  - The lead form can't be deleted, moved or duplicated, and its consent box is fixed (unchecked).
 */

type Props = {
  Hero: { variant: "split" | "statement"; title: string; body: string; cta: string };
  Faq: { heading: string; items: { q: string; a: string }[] };
  LeadForm: { heading: string };
};

const clamp = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

export const config: Config<Props> = {
  root: {
    render: ({ children }) => (
      <div dir="rtl" lang="he" style={{ fontFamily: "var(--font-assistant), system-ui, sans-serif" }} className="bg-[#f6f4f1] text-[#1d2326]">
        {children}
      </div>
    ),
  },
  categories: {
    open: { title: "פתיחה", components: ["Hero"] },
    info: { title: "מידע", components: ["Faq"] },
    contact: { title: "יצירת קשר", components: ["LeadForm"] },
  },
  components: {
    Hero: {
      label: "פתיח",
      fields: {
        variant: {
          type: "radio",
          label: "פריסה",
          options: [
            { label: "תמונה וטקסט", value: "split" },
            { label: "כותרת גדולה", value: "statement" },
          ],
        },
        title: { type: "text", label: "כותרת (עד 40 תווים)", contentEditable: true },
        body: { type: "textarea", label: "טקסט (עד 160 תווים)", contentEditable: true },
        cta: { type: "text", label: "כפתור (עד 18 תווים)" },
      },
      defaultProps: {
        variant: "split",
        title: "השתלת שיער בידיים של מנתח אחד",
        body: "ייעוץ אישי, ניתוח במרפאה ומעקב החלמה מתועד באפליקציה, יום אחרי יום.",
        cta: "לתיאום ייעוץ",
      },
      render: ({ variant, title, body, cta }) =>
        variant === "statement" ? (
          <section className="px-8 py-20">
            <h1 className="max-w-[16ch] text-[3.25rem] font-bold leading-[1.05] tracking-tight">{clamp(title, 40)}</h1>
            <p className="mt-6 max-w-[48ch] text-[1.25rem] leading-relaxed text-[#4c5559]">{clamp(body, 160)}</p>
            <a className="mt-8 inline-flex h-12 items-center rounded-full bg-[#1f5c63] px-7 font-semibold text-white">{clamp(cta, 18)}</a>
          </section>
        ) : (
          <section className="grid items-center gap-10 px-8 py-16 md:grid-cols-2">
            <div>
              <h1 className="text-[2.5rem] font-bold leading-tight">{clamp(title, 40)}</h1>
              <p className="mt-4 text-[1.125rem] leading-relaxed text-[#4c5559]">{clamp(body, 160)}</p>
              <a className="mt-6 inline-flex h-12 items-center rounded-md bg-[#1f5c63] px-6 font-semibold text-white">{clamp(cta, 18)}</a>
            </div>
            <div className="aspect-[4/5] rounded-lg bg-[#d9d4cc]" aria-label="תמונת המרפאה" />
          </section>
        ),
    },
    Faq: {
      label: "שאלות נפוצות",
      fields: {
        heading: { type: "text", label: "כותרת" },
        items: {
          type: "array",
          label: "שאלות (3 עד 8)",
          min: 3,
          max: 8,
          getItemSummary: (item) => item.q || "שאלה חדשה",
          defaultItemProps: { q: "", a: "" },
          arrayFields: { q: { type: "text", label: "שאלה" }, a: { type: "textarea", label: "תשובה" } },
        },
      },
      defaultProps: {
        heading: "שאלות שחוזרות אלינו",
        items: [
          { q: "כמה זמן לוקחת ההחלמה?", a: "רוב המטופלים חוזרים לשגרה תוך שבוע. התוצאה המלאה נראית אחרי שנה." },
          { q: "האם הניתוח כואב?", a: "הניתוח נעשה בהרדמה מקומית. בימים הראשונים יש רגישות שמטופלת בתרופות פשוטות." },
          { q: "איך מתעדים את ההחלמה?", a: "באפליקציה של המרפאה מצלמים לפי לוח זמנים, והרופא רואה את ההתקדמות." },
        ],
      },
      render: ({ heading, items }) => (
        <section className="px-8 py-14">
          <h2 className="text-[1.75rem] font-bold">{heading}</h2>
          <dl className="mt-6 divide-y divide-[#d9d4cc] border-y border-[#d9d4cc]">
            {items.map((item, i) => (
              <div key={i} className="py-4">
                <dt className="text-[1.125rem] font-semibold">{item.q}</dt>
                <dd className="mt-1 text-[1rem] leading-relaxed text-[#4c5559]">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ),
    },
    LeadForm: {
      label: "טופס פנייה",
      permissions: { delete: false, drag: false, duplicate: false },
      fields: { heading: { type: "text", label: "כותרת" } },
      defaultProps: { heading: "נשמח לחזור אליך" },
      render: ({ heading }) => (
        <section className="bg-[#1d2326] px-8 py-14 text-white">
          <h2 className="text-[1.75rem] font-bold">{heading}</h2>
          <div className="mt-6 grid max-w-md gap-3">
            <input className="h-12 rounded-md border border-white/20 bg-transparent px-4" placeholder="שם מלא" readOnly />
            <input className="h-12 rounded-md border border-white/20 bg-transparent px-4" placeholder="נייד" readOnly />
            <label className="flex items-start gap-2 text-[0.9375rem] text-white/80">
              <input type="checkbox" disabled className="mt-1" />
              אני מסכים/ה לקבל עדכונים ומבצעים מהמרפאה (לא חובה)
            </label>
          </div>
        </section>
      ),
    },
  },
};

export const initialData = {
  root: { props: {} },
  content: [
    { type: "Hero", props: { id: "hero-1", ...config.components.Hero.defaultProps } },
    { type: "Faq", props: { id: "faq-1", ...config.components.Faq.defaultProps } },
    { type: "LeadForm", props: { id: "lead-1", ...config.components.LeadForm.defaultProps } },
  ],
};
