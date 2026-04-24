import type { ApprovalRequest } from "../types";

type ApprovalsProps = {
  approvals: ApprovalRequest[];
  onDecision: (request: ApprovalRequest, decision: "accept" | "decline") => void;
  emptyMessage?: string;
};

export function Approvals({
  approvals,
  onDecision,
  emptyMessage = "",
}: ApprovalsProps) {
  if (!approvals.length) {
    return emptyMessage ? (
      <div className="approvals approvals-empty">{emptyMessage}</div>
    ) : null;
  }

  return (
    <div className="approvals">
      <div className="approvals-title">Approvals</div>
      {approvals.map((request) => (
        <div key={request.request_id} className="approval-card">
          <div className="approval-method-row">
            <div className="approval-method">{formatApprovalTitle(request.method)}</div>
            <div className="approval-method-id">#{request.request_id}</div>
          </div>
          <div className="approval-summary">
            {formatApprovalSummary(request.params) || "Review the request details below."}
          </div>
          <div className={`approval-risk ${approvalRisk(request.params)}`}>
            {approvalRiskLabel(request.params)}
          </div>
          <div className="approval-details">
            {buildApprovalFields(request.params).map((field) => (
              <div key={field.label} className="approval-field">
                <div className="approval-field-header">
                  <div className="approval-field-label">{field.label}</div>
                  <button
                    className="approval-copy"
                    onClick={() => void navigator.clipboard.writeText(field.value)}
                    type="button"
                  >
                    Copy
                  </button>
                </div>
                <pre className="approval-body">{field.value}</pre>
              </div>
            ))}
          </div>
          <details className="approval-raw">
            <summary>Raw payload</summary>
            <div className="approval-body approval-body-raw">
              {JSON.stringify(request.params, null, 2)}
            </div>
          </details>
          <div className="approval-actions">
            <button
              className="secondary"
              onClick={() => onDecision(request, "decline")}
            >
              Decline
            </button>
            <button
              className="primary"
              onClick={() => onDecision(request, "accept")}
            >
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatApprovalTitle(method: string) {
  if (method.includes("requestApproval")) {
    return "Approval requested";
  }
  return method;
}

function formatApprovalSummary(params: Record<string, unknown>) {
  const command = stringifyValue(params.command ?? params.cmd);
  const tool = stringifyValue(params.toolName ?? params.tool_name ?? params.tool);
  const path = stringifyValue(params.path ?? params.cwd ?? params.file);
  if (command) {
    return `Command wants to run: ${command}`;
  }
  if (tool) {
    return `Tool wants to run: ${tool}`;
  }
  if (path) {
    return `Request touches: ${path}`;
  }
  return "";
}

function buildApprovalFields(
  params: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const candidateFields: Array<[string, unknown]> = [
    ["Command", params.command ?? params.cmd],
    ["Tool", params.toolName ?? params.tool_name ?? params.tool],
    ["Path", params.path ?? params.cwd ?? params.file],
    ["Reason", params.reason ?? params.justification ?? params.prompt],
    ["Scope", params.scope ?? params.pattern ?? params.target],
  ];
  const fields = candidateFields
    .map(([label, value]) => ({
      label,
      value: stringifyValue(value),
    }))
    .filter((field) => field.value);
  return fields.length > 0
    ? fields
    : [
        {
          label: "Details",
          value: "No structured fields were provided for this approval request.",
        },
      ];
}

function stringifyValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyValue(entry)).filter(Boolean).join(" ");
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function approvalRisk(params: Record<string, unknown>) {
  const command = stringifyValue(params.command ?? params.cmd).toLowerCase();
  if (
    /\brm\b|\bsudo\b|\bchmod\b|\bchown\b|\bdd\b|\bmkfs\b|>\s*\/|--force|-rf/.test(
      command,
    )
  ) {
    return "high";
  }
  if (command || params.path || params.cwd || params.file) {
    return "medium";
  }
  return "low";
}

function approvalRiskLabel(params: Record<string, unknown>) {
  const risk = approvalRisk(params);
  if (risk === "high") {
    return "Review carefully";
  }
  if (risk === "medium") {
    return "Workspace action";
  }
  return "Low detail request";
}
