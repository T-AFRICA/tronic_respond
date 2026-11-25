import { redirect } from "next/navigation";

export default function Home() {
  // The root of the app is the staff command center.
  redirect("/dashboard");
}
