import { redirect } from "next/navigation";

export default function Home() {
  redirect("/route53/hosted-zones");
}
