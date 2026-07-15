import { AlertCircle, CheckCircle2 } from "lucide-react";

interface FeedbackProps {
  tone: "error" | "success" | "info";
  children: string;
}

export function Feedback({ tone, children }: FeedbackProps) {
  return (
    <div className={`feedback feedback--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}

export function LoadingView({ label = "読み込んでいます" }: { label?: string }) {
  return (
    <div className="loading-view" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
