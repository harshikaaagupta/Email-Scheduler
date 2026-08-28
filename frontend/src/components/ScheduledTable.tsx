import type { ScheduledEmail } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { StatusBadge } from "./ui/StatusBadge";
import { Table, Td, Th } from "./ui/Table";

interface ScheduledTableProps {
  emails: ScheduledEmail[];
  loading: boolean;
}

export function ScheduledTable({ emails, loading }: ScheduledTableProps) {
  if (loading) return <LoadingSpinner label="Loading scheduled emails..." />;
  if (emails.length === 0) {
    return (
      <EmptyState
        title="No scheduled emails yet"
        description="Click “Compose New Email” to schedule your first batch."
      />
    );
  }

  return (
    <Table>
      <thead className="bg-slate-50">
        <tr>
          <Th>Email</Th>
          <Th>Subject</Th>
          <Th>Scheduled time</Th>
          <Th>Sender</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {emails.map((email) => (
          <tr key={email.id}>
            <Td>{email.recipient}</Td>
            <Td>{email.subject}</Td>
            <Td>{new Date(email.scheduledFor).toLocaleString()}</Td>
            <Td>{email.sender?.email ?? "-"}</Td>
            <Td>
              <StatusBadge status={email.status} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
