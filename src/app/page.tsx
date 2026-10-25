import { redirect } from "next/navigation";

/** Until there is a public landing page, the root sends visitors to the clinic sign-in. */
export default function Home() {
  redirect("/clinic/login");
}
