import type { RunnerConfig } from "../lib/shell.ts";

export interface EmailDraft {
  recordId: string;
  term: string;
  subject: string;
  body: string;
}

export interface CourseFields {
  title?: string;
  term?: string;
  "short-description-for-news-or-poster"?: string;
  "long-description"?: string;
  "target-audience"?: string;
  schedule?: string;
  time?: string;
  location?: string;
  teacher?: string;
  "form-link"?: string;
  note?: string;
}

interface AirtableRecord {
  id: string;
  fields: CourseFields;
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

function pickDescription(fields: CourseFields): string {
  return (
    fields["short-description-for-news-or-poster"] ||
    fields["long-description"] ||
    ""
  );
}

function renderLine(label: string, value: string | undefined): string | null {
  if (!value) return null;
  return `${label}：${value}`;
}

function renderBody(fields: CourseFields): string {
  const formLink = fields["form-link"] || "";
  const lines: (string | null)[] = [
    fields.title ?? "",
    "",
    "課程簡介：",
    pickDescription(fields),
    "",
    renderLine("對象", fields["target-audience"]),
    renderLine("日期", fields.schedule),
    renderLine("時間", fields.time),
    renderLine("地點", fields.location),
    renderLine("導師", fields.teacher),
    "",
    formLink ? `報名連結：${formLink}` : null,
    "",
    fields.note ?? "",
  ];
  return lines
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pure renderer: build an {@link EmailDraft} from already-fetched course
 * fields. No I/O. Reused by the Op 5 email-send orchestrator so it can
 * fetch the record once (it needs `start-date` for the timing rule too)
 * rather than re-running the Op 4 fetch-then-render pipeline.
 */
export function renderEmailDraft(
  recordId: string,
  fields: CourseFields,
): EmailDraft {
  return {
    recordId,
    term: fields.term ?? "",
    subject: `課程報名：${fields.title ?? ""}`,
    body: renderBody(fields),
  };
}

export async function createEmail(
  recordId: string,
  config: RunnerConfig,
): Promise<EmailDraft> {
  const recordRaw = await config.runApiIntegrator("airtable:fetch-record", [
    "--id",
    recordId,
  ]);
  if (!isRecord(recordRaw)) {
    throw new Error(
      `airtable:fetch-record did not return a record: ${JSON.stringify(recordRaw).slice(0, 200)}`,
    );
  }
  return renderEmailDraft(recordId, recordRaw.fields);
}
