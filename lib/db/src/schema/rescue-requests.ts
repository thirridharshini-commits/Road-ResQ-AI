import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const rescueRequestsTable = pgTable("rescue_requests", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  description: text("description").notNull(),
  issueType: text("issue_type").notNull(),
  probableIssue: text("probable_issue").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull().default("requested"),
  riskScore: integer("risk_score").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  area: text("area").notNull(),
  vehicleType: text("vehicle_type").notNull().default("Car"),
  responderId: text("responder_id").notNull(),
  responderName: text("responder_name").notNull(),
  responderSpecialty: text("responder_specialty").notNull(),
  etaMinutes: integer("eta_minutes").notNull(),
  distanceKm: real("distance_km").notNull(),
  safeMode: boolean("safe_mode").notNull().default(false),
  trustedContactSharing: boolean("trusted_contact_sharing").notNull().default(false),
  priceMin: real("price_min").notNull(),
  priceMax: real("price_max").notNull(),
  replanCount: integer("replan_count").notNull().default(0),
  replanNote: text("replan_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRescueRequestSchema = createInsertSchema(rescueRequestsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRescueRequest = z.infer<typeof insertRescueRequestSchema>;
export type RescueRequest = typeof rescueRequestsTable.$inferSelect;
