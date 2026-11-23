import { DeskTabs, MobileBar, Sidebar } from "@/components/management/nav";

function StaffCard() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-full bg-gold-400 text-sm font-semibold text-navy-950">KA</span>
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium text-ivory-50">Kemi Ade</p>
        <p className="text-xs text-ivory-200/60">General manager</p>
      </div>
    </div>
  );
}

export default function PreviewAppLayout({ children }: LayoutProps<"/preview/app">) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-ivory-100 lg:flex-row">
      <Sidebar base="/preview/app" footer={<StaffCard />} />
      <MobileBar base="/preview/app" footer={<StaffCard />} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <DeskTabs base="/preview/app" />
    </div>
  );
}
