/**
 * In-process Server-Sent-Events hub for real-time notification push.
 *
 * Keeps one open HTTP response per connected client (a user can have more
 * than one — multiple tabs/the Electron window + a browser tab), keyed by
 * userId. `notifyUser` (services/notifications.ts) calls `pushToUser` right
 * after writing a Notification row so it reaches an already-open tab
 * immediately instead of waiting for NotificationBell's poll.
 *
 * In-process only — fine for a single backend instance. If this app is
 * ever run behind multiple backend processes/instances, a connection
 * landing on instance A can't be pushed to from instance B and this would
 * need a shared pub/sub (e.g. Redis) instead.
 */
import { Response } from "express";

const clientsByUser = new Map<string, Set<Response>>();

export function addClient(userId: string, res: Response): void {
  if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
  clientsByUser.get(userId)!.add(res);
}

export function removeClient(userId: string, res: Response): void {
  const set = clientsByUser.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientsByUser.delete(userId);
}

export function pushToUser(userId: string, event: unknown): void {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    res.write(payload);
  }
}
