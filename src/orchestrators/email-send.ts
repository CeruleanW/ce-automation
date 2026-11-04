/**
 * Op 5 — Send email. Composes the announcement email (re-using the Op 4
 * renderer) and sends it via api-integrator's `gws:exec gmail +send`
 * passthrough (the gws CLI's high-level `+send` helper, which handles
 * RFC 5322 MIME + base64 internally). Enforces the timing rule from `docs/workflows.md` Op 5
 * (Tuesday two weeks before the course start day) and the recipient
 * resolution from ADR-0005 (`--to` → `CE_EMAIL_RECIPIENTS` → throw).
 *
 * Real sends are never exercised in unit tests — `runApiIntegrator` is the
 * single mockable boundary (see `docs/testing.md`). Integration tests must
 * gate a real send behind `CE_DRY_RUN=true` or `test.skip`.
 *
 * Before the real `gws:exec` send, the orchestrator runs the pre-flight
 * `config.checkGwsAuth()` gate so an unauthenticated gws surfaces with
 * remediation hints instead of a confusing 401. The gate is skipped on
 * dry-run and before-deadline paths (neither touches gws).
 */
import type { RunnerConfig } from "../lib/shell.ts";
import { emailSendDeadline } from "../lib/clock.ts";
import { encodeRFC2047Subject } from "../lib/rfc2047.ts";
import { getEmailRecipients, parseRecipientList } from "../config.ts";
import {
  MissingRecipientsError,
  MissingStartDateError,
} from "../lib/errors.ts";
import {
  renderEmailDraft,
  type CourseFields,
  type EmailDraft,
} from "./email-create.ts";

export interface EmailSendOptions {
  /** Comma-separated recipient override (`--to` flag). */
  to?: string;
  /** Bypass the timing-rule check (`--force` flag). */
  force?: boolean;
  /** Skip the gws:exec send and return what would be sent. */
  dryRun?: boolean;
}

export type EmailSendResult =
  | { recordId: string; sent: false; plannedSendAt: string }
  | {
      recordId: string;
      sent: false;
      dryRun: true;
      recipients: string[];
      subject: string;
      body: string;
      sendArgs: string[];
    }
  | { recordId: string; sent: true; sentAt: string; messageId: string | null };

interface SendFields extends CourseFields {
  "start-date"?: string;
}

interface AirtableRecord {
  id: string;
  fields: SendFields;
}

function isRecord(raw: unknown): raw is AirtableRecord {
  if (typeof raw !== "object" || raw === null) return false;
  const obj = raw as { id?: unknown; fields?: unknown };
  return (
    typeof obj.id === "string" &&
    typeof obj.fields === "object" &&
    obj.fields !== null
  );
}

function resolveRecipients(toFlag: string | undefined): string[] {
  if (toFlag !== undefined) return parseRecipientList(toFlag);
  return getEmailRecipients();
}

function buildSendArgs(recipients: string[], draft: EmailDraft): string[] {
  const toArgs = recipients.flatMap((addr) => ["--to", addr]);
  return [
    "gmail",
    "+send",
    ...toArgs,
    "--subject",
    // RFC 2047: gws mangles raw non-ASCII subjects (Latin-1 double-encoding)
    // and RFC 5322 requires ASCII headers anyway. See lib/rfc2047.ts.
    encodeRFC2047Subject(draft.subject),
    "--body",
    draft.body,
  ];
}

function extractMessageId(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const obj = result as { data?: unknown; id?: unknown };
  const data = obj.data as { id?: unknown } | undefined;
  const id = data?.id ?? obj.id;
  return typeof id === "string" ? id : null;
}

export async function sendEmail(
  recordId: string,
  config: RunnerConfig,
  opts: EmailSendOptions = {},
): Promise<EmailSendResult> {
  const recordRaw = await config.runApiIntegrator("airtable:fetch-record", [
    "--id",
    recordId,
  ]);
  if (!isRecord(recordRaw)) {
    throw new Error(
      `airtable:fetch-record did not return a record: ${JSON.stringify(recordRaw).slice(0, 200)}`,
    );
  }
  const fields = recordRaw.fields;
  const startDateStr = fields["start-date"];
  if (!startDateStr) {
    throw new MissingStartDateError(recordId);
  }

  const deadline = emailSendDeadline(new Date(startDateStr));
  const now = config.now();

  if (now < deadline && !opts.force) {
    return {
      recordId,
      sent: false,
      plannedSendAt: deadline.toISOString(),
    };
  }

  const recipients = resolveRecipients(opts.to);
  if (recipients.length === 0) {
    throw new MissingRecipientsError();
  }

  const draft = renderEmailDraft(recordId, fields);
  const sendArgs = buildSendArgs(recipients, draft);

  if (opts.dryRun) {
    return {
      recordId,
      sent: false,
      dryRun: true,
      recipients,
      subject: draft.subject,
      body: draft.body,
      sendArgs,
    };
  }

  await config.checkGwsAuth();

  const result = await config.runApiIntegrator("gws:exec", sendArgs);
  return {
    recordId,
    sent: true,
    sentAt: now.toISOString(),
    messageId: extractMessageId(result),
  };
}
