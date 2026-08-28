import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { disconnectSlack, extractApiErrorMessage, slackConnectUrl } from "../api/client";
import { Button } from "./ui/Button";

export function Header() {
  const { user, logout, refresh } = useAuth();
  const { showToast } = useToast();

  if (!user) return null;

  async function handleSlackDisconnect() {
    try {
      await disconnectSlack();
      await refresh();
      showToast("Slack disconnected");
    } catch (err) {
      showToast(extractApiErrorMessage(err), "error");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-brand-600">📬</span>
        <span className="text-lg font-semibold text-slate-900">Email Scheduler</span>
      </div>

      <div className="flex items-center gap-4">
        {user.slackConnected ? (
          <Button variant="secondary" onClick={handleSlackDisconnect} title={`Connected to ${user.slackTeamName ?? "Slack"}`}>
            ✅ Slack Connected
          </Button>
        ) : (
          <a href={slackConnectUrl()}>
            <Button variant="secondary">Connect Slack</Button>
          </a>
        )}

        <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <p className="text-sm font-medium text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>

        <Button variant="ghost" onClick={logout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
