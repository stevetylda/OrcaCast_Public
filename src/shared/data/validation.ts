import { z, type ZodError } from "zod";
import { DataLoadError } from "./errors";

const finiteNumber = z
  .number()
  .refine(Number.isFinite, { message: "Expected a finite number" });

const probability = finiteNumber.min(0).max(1);

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
        message:
          "Expected at least one of data_version, version, build_id, or buildId",
      });
    }
  });

const numericRecordSchema = z.record(z.string(), probability);

const forecastCoverageSchema = z
  .object({
    grid_cell_count: z.number().int().nonnegative(),
    modeled_cell_count: z.number().int().nonnegative(),
    unknown_cell_count: z.number().int().nonnegative(),
    missing_cell_policy: z.literal("omitted_as_unknown"),
    unknown_reason: z.literal("outside_model_support"),
  })
  .superRefine((value, ctx) => {
    if (
      value.modeled_cell_count + value.unknown_cell_count !==
      value.grid_cell_count
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "modeled and unknown counts must equal grid_cell_count",
      });
    }
  });

export const forecastPayloadSchema = z
  .object({
    target_start: z.string().optional(),
    target_end: z.string().optional(),
    schema_version: z.number().int().optional(),
    resolution: z.enum(["H4", "H5", "H6"]).optional(),
    values: numericRecordSchema.optional(),
    model: z.string().optional(),
    models: z
      .array(
        z.object({
          id: z.string().optional(),
          model: z.string().optional(),
          values: numericRecordSchema,
          coverage: forecastCoverageSchema.optional(),
        }),
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
    if (value.schema_version === 2) {
      if (
        !value.target_start ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.target_start)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["target_start"],
          message: "Forecast schema v2 requires target_start as YYYY-MM-DD",
        });
      }
      if (!value.target_end || !/^\d{4}-\d{2}-\d{2}$/.test(value.target_end)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["target_end"],
          message: "Forecast schema v2 requires target_end as YYYY-MM-DD",
        });
      }
      if (!value.resolution) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resolution"],
          message: "Forecast schema v2 requires resolution",
        });
      }
      if (!value.models?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["models"],
          message: "Forecast schema v2 requires at least one model",
        });
      }
      value.models?.forEach((model, index) => {
        if (!model.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["models", index, "id"],
            message: "Forecast schema v2 requires a model id",
          });
        }
        if (!model.coverage) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["models", index, "coverage"],
            message: "Forecast schema v2 requires model coverage",
          });
          return;
        }
        if (
          Object.keys(model.values).length !== model.coverage.modeled_cell_count
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["models", index, "coverage", "modeled_cell_count"],
            message: "modeled_cell_count must equal the number of value cells",
          });
        }
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
  label: string,
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
