import { z, type ZodError } from "zod";
import { DataLoadError } from "./errors";

const finiteNumber = z.number().refine(Number.isFinite, { message: "Expected a finite number" });

const periodSchema = z.object({
  year: z.number().int().min(1900).max(9999),
  stat_week: z.number().int().min(1).max(53),
  label: z.string().optional(),
});

export const periodsFileSchema = z.array(periodSchema);

export const dataMetaFileSchema = z
  .object({
    data_version: z.string().trim().optional(),
    generated_at: z.string().trim().optional(),
    active_explainability_context: z.string().trim().optional(),
    version: z.string().trim().optional(),
    build_id: z.string().trim().optional(),
    buildId: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      !value.data_version?.length &&
      !value.version?.length &&
      !value.build_id?.length &&
      !value.buildId?.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected at least one of data_version, version, build_id, or buildId",
      });
    }
  });

const numericRecordSchema = z.record(z.string(), finiteNumber);

export const forecastPayloadSchema = z
  .object({
    target_start: z.string().optional(),
    target_end: z.string().optional(),
    values: numericRecordSchema.optional(),
    model: z.string().optional(),
    models: z
      .array(
        z.object({
          id: z.string().optional(),
          model: z.string().optional(),
          values: numericRecordSchema,
        })
      )
      .optional(),
    valuesByModel: z.record(z.string(), numericRecordSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.values && !value.models?.length && !value.valuesByModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected one of values, models, or valuesByModel",
      });
    }
  });

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  path: string,
  label: string
): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  throw new DataLoadError({
    kind: "validation",
    url: path,
    message: `${label} failed validation`,
    details: formatZodError(parsed.error),
  });
}
