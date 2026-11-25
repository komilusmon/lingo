import { supabase } from '../lib/supabase';
import type { DrillSession } from '../lib/types';

const SYNC_QUEUE_KEY = 'krasword-sync-queue-v1';

export type SyncReason =
  | 'session-generated'
  | 'answer-correct'
  | 'answer-wrong'
  | 'penalty'
  | 'session-completed'
  | 'manual-save';

export interface SyncQueueEvent {
  id: string;
  createdAt: string;
  reason: SyncReason;
  sessionId: string;
  xpDelta: number;
  payload: {
    id: string;
    level: DrillSession['level'];
    status: DrillSession['status'];
    correct_count: number;
    total_count: number;
    xp_balance: number;
    items: DrillSession['items'];
    created_at: string;
  };
}

function createId() {
  return crypto.randomUUID();
}

export function getQueue(): SyncQueueEvent[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SyncQueueEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setQueue(queue: SyncQueueEvent[]) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueSessionSync(session: DrillSession, reason: SyncReason, xpDelta = 0): SyncQueueEvent {
  const event: SyncQueueEvent = {
    id: createId(),
    createdAt: new Date().toISOString(),
    reason,
    sessionId: session.id,
    xpDelta,
    payload: {
      id: session.id,
      level: session.level,
      status: session.status,
      correct_count: session.correctCount,
      total_count: session.totalCount,
      xp_balance: session.xpBalance,
      items: session.items,
      created_at: session.createdAt,
    },
  };

  const queue = getQueue();
  queue.push(event);
  setQueue(queue);
  return event;
}

async function upsertPayload(payload: SyncQueueEvent['payload']) {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { error } = await supabase.from('drill_sessions').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw error;
  }
}

export async function flushQueue(): Promise<{ sent: number; pending: number }> {
  const queue = getQueue();
  if (!queue.length) {
    return { sent: 0, pending: 0 };
  }

  if (!navigator.onLine || !supabase) {
    return { sent: 0, pending: queue.length };
  }

  const pending: SyncQueueEvent[] = [];
  let sent = 0;

  for (const event of queue) {
    try {
      await upsertPayload(event.payload);
      sent += 1;
    } catch {
      pending.push(event);
    }
  }

  setQueue(pending);
  return { sent, pending: pending.length };
}

export async function syncNowOrQueue(session: DrillSession, reason: SyncReason, xpDelta = 0) {
  enqueueSessionSync(session, reason, xpDelta);
  return flushQueue();
}
