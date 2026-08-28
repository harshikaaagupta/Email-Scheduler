import type { SentEmail } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { StatusBadge } from "./ui/StatusBadge";
import { Table, Td, Th } from "./ui/Table";

interface SentTableProps {
  emails: SentEmail[];
  loading: boolean;
}

export function SentTable({ emails, loading }: SentTableProps) {
  if (loading) return <LoadingSpinner label="Loading sent emails..." />;
  if (emails.length === 0) {
    return <EmptyState title="No sent emails yet" description="Emails will show up here once they've gone out." />;
  }

  return (
    <Table>
      <thead className="bg-slate-50">
        <tr>
          <Th>Email</Th>
          <Th>Subject</Th>
          <Th>Sent time</Th>
          <Th>Sender</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {emails.map((email) => (
          <tr key={email.id}>
            <Td>{email.recipient}</Td>
            <Td>{email.subject}</Td>
            <Td>{email.sentAt ? new Date(email.sentAt).toLocaleString() : "-"}</Td>
            <Td>{email.sender?.email ?? "-"}</Td>
            <Td>
              <StatusBadge status={email.status} />
              {email.status === "FAILED" && email.error && (
                <p className="mt-1 max-w-xs truncate text-xs text-red-500" title={email.error}>
                  {email.error}
                </p>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
