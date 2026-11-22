import { redirect } from "next/navigation";

/** Website photos moved into Rates & room types. */
export default function OldWebsitePhotosPage() {
  redirect("/app/rooms/categories/photos");
}
