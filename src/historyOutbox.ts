import type { EncryptedHistoryPayload } from "./crypto";

export type PendingEncryptedHistoryRecord = {
  id: string;
  storageId: string;
  createdAt: string;
  updatedAt?: string;
  payload: EncryptedHistoryPayload;
};

const PENDING_HISTORY_KEY = "easygrab:pending-encrypted-history";

export function readPendingHistoryRecords() {
  try {
    return JSON.parse(window.localStorage.getItem(PENDING_HISTORY_KEY) || "[]") as PendingEncryptedHistoryRecord[];
  } catch {
    return [];
  }
}

export function writePendingHistoryRecords(records: PendingEncryptedHistoryRecord[]) {
  window.localStorage.setItem(PENDING_HISTORY_KEY, JSON.stringify(records));
}

export function enqueuePendingHistoryRecord(record: PendingEncryptedHistoryRecord) {
  const records = readPendingHistoryRecords().filter((item) => item.id !== record.id);
  records.unshift(record);
  writePendingHistoryRecords(records.slice(0, 50));
}
