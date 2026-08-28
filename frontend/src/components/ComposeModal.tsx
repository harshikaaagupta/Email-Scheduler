import { useState, type FormEvent } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { TextArea } from "./ui/TextArea";
import { Button } from "./ui/Button";
import { createCampaign, extractApiErrorMessage } from "../api/client";
import { useToast } from "../context/ToastContext";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function defaultStartTime(): string {
  const now = new Date(Date.now() + 5 * 60 * 1000);
  now.setSeconds(0, 0);
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export function ComposeModal({ open, onClose, onScheduled }: ComposeModalProps) {
  const { showToast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [detectedCount, setDetectedCount] = useState(0);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setSubject("");
    setBody("");
    setFile(null);
    setDetectedCount(0);
    setStartTime(defaultStartTime());
    setDelaySeconds(30);
    setHourlyLimit(200);
    setError(null);
  }

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    if (!selected) {
      setDetectedCount(0);
      return;
    }
    const text = await selected.text();
    const matches = text.match(EMAIL_REGEX) ?? [];
    setDetectedCount(new Set(matches.map((m) => m.toLowerCase())).size);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Upload a CSV/TXT file of email leads.");
      return;
    }
    if (detectedCount === 0) {
      setError("No email addresses were detected in that file.");
      return;
    }

    setSubmitting(true);
    try {
      const startTimeIso = new Date(startTime).toISOString();
      const result = await createCampaign({ subject, body, startTime: startTimeIso, delaySeconds, hourlyLimit, file });
      showToast(`Scheduled ${result.recipientCount} email(s) successfully.`);
      resetForm();
      onScheduled();
      onClose();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compose New Email">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="subject"
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Your monthly newsletter"
          required
        />

        <TextArea
          id="body"
          label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the email content here (HTML supported)..."
          rows={5}
          required
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="leads">
            Upload leads (CSV/TXT)
          </label>
          <input
            id="leads"
            type="file"
            accept=".csv,.txt"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          {file && (
            <p className="text-xs text-slate-500">
              Detected <span className="font-semibold text-slate-700">{detectedCount}</span> email address
              {detectedCount === 1 ? "" : "es"} in {file.name}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            id="startTime"
            label="Start time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <Input
            id="delaySeconds"
            label="Delay between emails (s)"
            type="number"
            min={0}
            value={delaySeconds}
            onChange={(e) => setDelaySeconds(Number(e.target.value))}
            required
          />
          <Input
            id="hourlyLimit"
            label="Hourly limit"
            type="number"
            min={1}
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(Number(e.target.value))}
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
