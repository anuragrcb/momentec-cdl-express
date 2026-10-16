import { randomUUID } from "node:crypto";
import { readGarmentFit, type GarmentFit } from "./mark-measure";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const JOB_ID = new RegExp(`^(?:job-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z_)?${UUID}$`, "i");

export type ProofCustomer = {
  category: string;
  name: string;
  email: string;
  message: string;
};

export type ProofCatalogLocation = {
  code: string;
  name: string;
  legacy?: boolean;
  params?: string[];
};

export type ProofCatalogZone = {
  code: string;
  name: string;
};

export type ProofCatalogPlan = {
  colorZoneMapping?: string[];
  logoMapping?: string[];
  textMapping?: string[];
  viewPlan?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
};

export type ProofCatalogContext = {
  style: string;
  name?: string;
  brand?: string;
  sport?: string;
  segment?: string;
  logo_locations?: ProofCatalogLocation[];
  text_locations?: ProofCatalogLocation[];
  color_zones?: ProofCatalogZone[];
  plan?: ProofCatalogPlan;
};

export type ProofJob = ProofCustomer &
  GarmentFit & {
    jobId: string;
    catalog?: ProofCatalogContext;
  };

export type ProofObjectKeys = {
  sheet: string;
  job: string;
  status: string;
  pdf: string;
};

export function newProofJobId(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replaceAll(":", "-") + "Z";
  return `job-${stamp}_${randomUUID()}`;
}

export function proofObjectKeys(jobId: string): ProofObjectKeys {
  if (!JOB_ID.test(jobId)) throw new Error("Bad job id.");
  return {
    sheet: `${jobId}/sheet.png`,
    job: `${jobId}/job.json`,
    status: `${jobId}/status.json`,
    pdf: `${jobId}/proof.pdf`,
  };
}

export function readProofCustomer(input: {
  category: unknown;
  name: unknown;
  email: unknown;
  message: unknown;
}): ProofCustomer | null {
  const category = text(input.category, 80, false);
  const name = text(input.name, 120, false);
  const email = text(input.email, 200, false);
  const message = text(input.message, 2000, true);
  if (!category || !name || !email || message === null) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return { category, name, email, message };
}

export function readProofCatalog(input: unknown): ProofCatalogContext | undefined {
  let value = input;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const style = text(record.style, 40, false);
  if (!style) return undefined;
  const name = text(record.name, 200, true) || undefined;
  const brand = text(record.brand, 80, true) || undefined;
  const sport = text(record.sport, 80, true) || undefined;
  const segment = text(record.segment, 40, true) || undefined;
  return {
    style,
    ...(name ? { name } : {}),
    ...(brand ? { brand } : {}),
    ...(sport ? { sport } : {}),
    ...(segment ? { segment } : {}),
    logo_locations: readLocationArray(record.logo_locations),
    text_locations: readLocationArray(record.text_locations),
    color_zones: readZoneArray(record.color_zones),
    ...(record.plan && typeof record.plan === "object" ? { plan: readPlanObject(record.plan as Record<string, unknown>) } : {}),
  };
}

export function parseStoredProofJob(raw: string, jobId: string): ProofJob {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Job file is not JSON.");
  }
  if (!value || typeof value !== "object") throw new Error("Job file is not JSON.");
  const record = value as Record<string, unknown>;
  if (record.jobId !== jobId) throw new Error("Job file does not match this upload.");
  const fit = readGarmentFit(record.gender, record.size);
  const customer = readProofCustomer({
    category: record.category,
    name: record.name,
    email: record.email,
    message: record.message,
  });
  if (!fit || !customer) throw new Error("Job file is missing the customer or the size.");
  const catalog = readProofCatalog(record.catalog);
  return { jobId, ...fit, ...customer, ...(catalog ? { catalog } : {}) };
}

function readLocationArray(value: unknown): ProofCatalogLocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    const code = text(r.code, 20, true) ?? "";
    const name = text(r.name, 120, true) ?? "";
    if (!code && !name) return [];
    const params = Array.isArray(r.params)
      ? r.params.filter((p): p is string => typeof p === "string").slice(0, 10)
      : undefined;
    return [{ code, name, legacy: Boolean(r.legacy), ...(params ? { params } : {}) }];
  });
}

function readZoneArray(value: unknown): ProofCatalogZone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    const code = text(r.code, 80, true) ?? "";
    const name = text(r.name, 120, true) ?? "";
    if (!code && !name) return [];
    return [{ code, name }];
  });
}

function readPlanObject(r: Record<string, unknown>): ProofCatalogPlan {
  const stringList = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 20)
      : [];
  const vp = r.viewPlan && typeof r.viewPlan === "object" ? (r.viewPlan as Record<string, unknown>) : undefined;
  return {
    colorZoneMapping: stringList(r.colorZoneMapping),
    logoMapping: stringList(r.logoMapping),
    textMapping: stringList(r.textMapping),
    ...(vp
      ? {
          viewPlan: {
            front: typeof vp.front === "string" ? vp.front.slice(0, 600) : undefined,
            back: typeof vp.back === "string" ? vp.back.slice(0, 600) : undefined,
            left: typeof vp.left === "string" ? vp.left.slice(0, 600) : undefined,
            right: typeof vp.right === "string" ? vp.right.slice(0, 600) : undefined,
          },
        }
      : {}),
  };
}

function text(value: unknown, max: number, allowEmpty: boolean): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max) return null;
  if (!allowEmpty && trimmed.length === 0) return null;
  return trimmed;
}
