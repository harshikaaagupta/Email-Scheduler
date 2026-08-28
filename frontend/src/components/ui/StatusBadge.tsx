const STYLES: Record<string, string> = {
  SCHEDULED: "bg-amber-100 text-amber-800",
  QUEUED: "bg-amber-100 text-amber-800",
  SENDING: "bg-blue-100 text-blue-800",
  SENT: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}>
      {status.toLowerCase()}
    </span>
  );
}
