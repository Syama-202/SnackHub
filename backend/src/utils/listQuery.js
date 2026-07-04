// The admin console's long lists (orders, complaints, fines, cash, pay disputes) show the newest
// rows first. "Show older" asks again with a larger limit, which keeps working while the list
// refreshes itself every few seconds.
import { z } from 'zod';

export const LIST_MAX = 500;
// finding an order: its number or part of the shop's name, and optionally one status
export const orderSearch = (statuses) => z.object({ limit: z.coerce.number().int().min(1).max(LIST_MAX).optional(), q: z.string().trim().min(1).max(60).optional(), status: z.enum(statuses).optional() }).strict();
export const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(LIST_MAX).optional() }).strict();
