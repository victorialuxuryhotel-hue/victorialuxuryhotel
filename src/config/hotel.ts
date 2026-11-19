/**
 * Hotel facts supplied by the hotel in the client requirements form
 * (15 Nov 2026). Do not add facilities, policies or rates that the hotel has
 * not confirmed. Room categories and rates live in the database, not here.
 */
export const hotel = {
  name: "Victoria Luxury Hotel and Apartment",
  shortName: "Victoria Luxury Hotel",
  address: {
    line1: "Block XVI, Plot 40, Alagbaka GRA",
    city: "Akure",
    state: "Ondo State",
    country: "Nigeria",
  },
  phone: "+2349051457000",
  phoneDisplay: "+234 905 145 7000",
  whatsapp: "2349051457000",
  email: "victorialuxuryltd.info@gmail.com",
  mapsUrl: "https://maps.app.goo.gl/ytWtq1xgSCk4NcZx9",
  currency: "NGN",
  timezone: "Africa/Lagos",
  facilities: [
    "Restaurant",
    "Bar",
    "Indoor swimming pool",
    "Conference room",
    "Spa",
    "Free Wi-Fi",
    "Parking",
    "Laundry",
    "24/7 power",
    "Airport shuttle",
  ],
} as const;
