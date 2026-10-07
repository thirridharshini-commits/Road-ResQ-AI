import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { rescueRequestsTable } from "./rescue-requests";

export const rescueSosEventsTable = pgTable("rescue_sos_events", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  rescueId: integer("rescue_id").references(() => rescueRequestsTable.id, { onDelete: "set null" }),
  emergencyType: text("emergency_type").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  area: text("area").notNull(),
  trustedContactSharing: boolean("trusted_contact_sharing").notNull().default(false),
  emergencyServicesContacted: boolean("emergency_services_contacted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRescueSosEventSchema = createInsertSchema(rescueSosEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRescueSosEvent = z.infer<typeof insertRescueSosEventSchema>;
export type RescueSosEvent = typeof rescueSosEventsTable.$inferSelect;
