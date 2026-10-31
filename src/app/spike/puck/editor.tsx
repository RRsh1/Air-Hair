"use client";

import { Puck, type Data } from "@puckeditor/core";
import { useState } from "react";
import { config, initialData } from "./config";
import { he } from "./dictionary";

export function SpikeEditor() {
  const [published, setPublished] = useState<Data | null>(null);
  return (
    <div dir="rtl" lang="he">
      <Puck
        config={config}
        data={initialData as Data}
        dictionary={he}
        headerTitle="דף הנחיתה של המרפאה"
        viewports={[
          { width: 390, height: "auto", label: "נייד", icon: "Smartphone" },
          { width: 1280, height: "auto", label: "מחשב", icon: "Monitor" },
        ]}
        onPublish={setPublished}
      />
      {published && (
        <pre id="published-json" dir="ltr" className="max-h-80 overflow-auto bg-black p-4 text-[12px] text-green-200">
          {JSON.stringify(published, null, 2)}
        </pre>
      )}
    </div>
  );
}
