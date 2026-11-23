import { z } from "zod";

/**
 * A record id: 8-4-4-4-12 hex. Looser than z.uuid(), because the starter rooms
 * were created with ids whose variant digit isn't RFC 4122, and those ids are
 * already referenced by bookings on the live database.
 */
export const recordId = (message = "Invalid id") => z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, message);
