import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "../components/Header";
import { Tabs } from "../components/Tabs";
import { ScheduledTable } from "../components/ScheduledTable";
import { SentTable } from "../components/SentTable";
import { ComposeModal } from "../components/ComposeModal";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useAsyncList } from "../hooks/useAsyncList";
import { fetchScheduledEmails, fetchSentEmails } from "../api/client";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

type TabKey = "scheduled" | "sent";

export function Dashboard() {
  const [tab, setTab] = useState<TabKey>("scheduled");
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [params] = useSearchParams();
  const { showToast } = useToast();
  const { refresh } = useAuth();

  useEffect(() => {
    const slack = params.get("slack");
    if (slack === "connected") {
      showToast("Slack connected! You'll get notified when a sender hits its rate limit.");
      refresh();
    } else if (slack === "error") {
      showToast("Could not connect Slack. Please try again.", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const scheduled = useAsyncList(() => fetchScheduledEmails(search || undefined), [search, tab]);
  const sent = useAsyncList(() => fetchSentEmails(search || undefined), [search, tab]);

  function refetchActive() {
    scheduled.refetch();
    sent.refetch();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Tabs
            active={tab}
            onChange={(key) => setTab(key as TabKey)}
            tabs={[
              { key: "scheduled", label: "Scheduled Emails" },
              { key: "sent", label: "Sent Emails" },
            ]}
          />
          <Button onClick={() => setComposeOpen(true)}>+ Compose New Email</Button>
        </div>

        <div className="mb-4 max-w-sm">
          <Input
            placeholder="Search by recipient or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {(tab === "scheduled" ? scheduled.error : sent.error) && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {tab === "scheduled" ? scheduled.error : sent.error}
          </p>
        )}

        {tab === "scheduled" ? (
          <ScheduledTable emails={scheduled.data} loading={scheduled.loading} />
        ) : (
          <SentTable emails={sent.data} loading={sent.loading} />
        )}
      </main>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} onScheduled={refetchActive} />
    </div>
  );
}
