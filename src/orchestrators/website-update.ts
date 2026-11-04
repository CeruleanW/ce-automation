import { createHash } from "node:crypto";
import type { RunnerConfig } from "../lib/shell.ts";
import { renderEmailDraft } from "./email-create.ts";

interface WebsiteCourseRecord {
  id: string;
  fields: {
    title?: string;
    term?: string;
    "start-date"?: string;
    "short-description-for-news-or-poster"?: string;
    "long-description"?: string;
    "target-audience"?: string;
    schedule?: string;
    time?: string;
    location?: string;
    teacher?: string;
    "form-link"?: string;
    note?: string;
  };
}

function isWebsiteCourseRecord(value: unknown): value is WebsiteCourseRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { id?: unknown; fields?: unknown };
  return (
    typeof record.id === "string" &&
    typeof record.fields === "object" &&
    record.fields !== null
  );
}

function newsIdForAirtableRecord(recordId: string): string {
  // A fixed UUID namespace makes the website news row stable across retries.
  const namespace = Buffer.from("7dfe2d34203e4ea58ab243dd1f90c14a", "hex");
  const digest = createHash("sha1").update(namespace).update(recordId).digest();
  const bytes = digest.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireNewsDate(value: string | undefined, recordId: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Airtable course ${recordId} needs a start-date in YYYY-MM-DD format to publish website news`,
    );
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error(
      `Airtable course ${recordId} has an invalid start-date: ${value}`,
    );
  }
  return value;
}

export async function updateWebsite(
  recordId: string,
  config: Pick<RunnerConfig, "runApiIntegrator">,
): Promise<{ recordId: string; course: unknown; news: unknown }> {
  const rawRecord = await config.runApiIntegrator("airtable:fetch-record", [
    "--id",
    recordId,
  ]);
  if (!isWebsiteCourseRecord(rawRecord)) {
    throw new Error(
      `airtable:fetch-record did not return a record: ${JSON.stringify(rawRecord).slice(0, 200)}`,
    );
  }
  if (!rawRecord.fields.title?.trim()) {
    throw new Error(
      `Airtable course ${recordId} needs a title to update the website`,
    );
  }

  const date = requireNewsDate(rawRecord.fields["start-date"], recordId);
  const draft = renderEmailDraft(recordId, rawRecord.fields);
  const course = await config.runApiIntegrator(
    "supabase:course:sync-airtable",
    ["--id", recordId],
  );
  const newsArgs = [
    "--id",
    newsIdForAirtableRecord(recordId),
    "--title",
    rawRecord.fields.title,
    "--content",
    draft.body,
    "--date",
    date,
    ...(rawRecord.fields["form-link"]?.trim()
      ? ["--form-link", rawRecord.fields["form-link"]]
      : []),
  ];
  const news = await config.runApiIntegrator("supabase:news:upsert", newsArgs);

  return { recordId, course, news };
}
