export type TransferHistoryEntry = {
  id: string;
  mode: "sent" | "received";
  peerName: string;
  fileCount: number;
  totalBytes: number;
  completedAt: number;
};

const KEY = "peerdrop-transfer-history";

export function readTransferHistory(): TransferHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TransferHistoryEntry[];
  } catch {
    return [];
  }
}

export function addTransferHistory(entry: TransferHistoryEntry) {
  if (typeof window === "undefined") return;
  const next = [entry, ...readTransferHistory()].slice(0, 8);
  localStorage.setItem(KEY, JSON.stringify(next));
}
