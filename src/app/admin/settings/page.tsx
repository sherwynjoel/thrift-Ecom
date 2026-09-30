import { SettingsForm } from "@/components/admin/settings-form";
import { getSettings } from "@/server/services/settings";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const settings = await getSettings();
  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <h1 className="text-4xl sm:text-5xl">Settings</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
