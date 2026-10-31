"use client";

import "@puckeditor/core/no-external.css";
import dynamic from "next/dynamic";

/** The editor runs only in the browser: Puck creates ids with crypto.randomUUID() while rendering. */
export const ClientEditor = dynamic(() => import("./editor").then((m) => m.SpikeEditor), {
  ssr: false,
  loading: () => <p className="p-8 text-slate">טוען את העורך…</p>,
});
