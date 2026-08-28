import { useSearchParams } from "react-router-dom";
import { googleLoginUrl } from "../api/client";
import { Button } from "../components/ui/Button";

export function Login() {
  const [params] = useSearchParams();
  const error = params.get("error");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-4xl">📬</div>
        <h1 className="text-xl font-semibold text-slate-900">Email Scheduler</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to schedule and track your email campaigns.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Sign-in failed. Please try again.
          </p>
        )}

        <a href={googleLoginUrl()} className="mt-6 block">
          <Button className="w-full justify-center" variant="secondary">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.4 26.9 36 24 36c-5.2 0-9.7-3.3-11.3-7.9l-6.6 5.1C9.9 39.6 16.4 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.6 5.6C41.6 35.9 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z"
              />
            </svg>
            Sign in with Google
          </Button>
        </a>
      </div>
    </div>
  );
}
