import { Tabs } from "./toolbar";

export function RatesTabs({ current }: { current: "types" | "photos" }) {
  return (
    <div className="bg-ivory-50">
      <Tabs
        items={[
          { label: "Rates & room types", href: "/app/rooms/categories", active: current === "types" },
          { label: "Website photos", href: "/app/rooms/categories/photos", active: current === "photos" },
        ]}
      />
    </div>
  );
}
