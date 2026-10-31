import { notFound } from "next/navigation";
import { ClientEditor } from "./client-only";

/** Throwaway spike (branch spike/puck only): Puck in Hebrew RTL. Not available in production. */
export default function PuckSpike() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ClientEditor />;
}
