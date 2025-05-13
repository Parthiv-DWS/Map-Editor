import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Since we're not actually using the database for this application
// but the schema file is required, we'll define a minimal schema
// that could hypothetically be used for user accounts if we were
// to expand the app to include server-side storage

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// If we were to store map data server-side, we might have tables like these:
// Just defining types for reference

/*
export const mapData = pgTable("map_data", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  bounds: jsonb("bounds").notNull(),
  features: jsonb("features").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type MapData = typeof mapData.$inferSelect;
export type InsertMapData = typeof mapData.$inferInsert;
*/
