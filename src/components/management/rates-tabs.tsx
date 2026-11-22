import { Tabs } from "./toolbar";

/** Rates & room types: the room types guests book, and the photos on the website. */
export function RatesTabs({ current }: { current: "types" | "photos" }) {
  return (
    <div className="bg-white">
      <Tabs
        items={[
          { label: "Room types & rates", href: "/app/rooms/categories", active: current === "types" },
          { label: "Website photos", href: "/app/rooms/categories/photos", active: current === "photos" },
        ]}
      />
    </div>
  );
}
