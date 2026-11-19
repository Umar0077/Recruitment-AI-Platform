import { Compass } from "lucide-react";
import { ErrorScreen } from "@/components/ui/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      icon={<Compass />}
      code="404"
      title="This Page Couldn't Be Found"
      body="The link may be out of date, or the page may have moved. Check the address, or head back to a page you know."
      primary={{ label: "Interview Home", href: "/" }}
      secondary={{ label: "Recruiter Workspace", href: "/admin" }}
    />
  );
}
