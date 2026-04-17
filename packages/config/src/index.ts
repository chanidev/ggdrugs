import { z, type ZodTypeAny } from 'zod';
import {
  fullSchema,
  productionRequiredKeys,
  type FullEnv,
} from './schema.js';

export * from './schema.js';

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
  constructor(public readonly issues: z.ZodIssue[]) {
    const lines = issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    super(`환경변수 검증 실패:\n${lines.join('\n')}`);
  }
}

export interface LoadEnvOptions {
  /** 기본값: `process.env`. 테스트 시 주입용. */
  source?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** 프로덕션 필수 키 검증을 강제로 끌 때. 기본값: 자동 (NODE_ENV 기반). */
  enforceProductionKeys?: boolean;
}

/**
 * 전체 환경변수를 검증해서 타입-safe한 객체를 반환한다.
 * 실패 시 `EnvValidationError`를 throw한다 (모든 이슈를 한 번에 모아서).
 *
 * 서비스별로 일부만 검증하려면 `loadPartial(schema)` 사용.
 */
export function loadEnv(options: LoadEnvOptions = {}): FullEnv {
  const source = options.source ?? process.env;
  const parsed = fullSchema.safeParse(source);

  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.issues);
  }

  const enforceProdKeys =
    options.enforceProductionKeys ?? parsed.data.NODE_ENV === 'production';

  if (enforceProdKeys) {
    const missing = productionRequiredKeys.filter((key) => parsed.data[key] === '');
    if (missing.length > 0) {
      throw new EnvValidationError(
        missing.map<z.ZodIssue>((key) => ({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'NODE_ENV=production에서는 이 키가 비어있을 수 없습니다.',
        })),
      );
    }
  }

  return parsed.data;
}

/**
 * 특정 서비스에 필요한 일부 스키마만 검증할 때 사용.
 * 예: `loadPartial(coreSchema.merge(openaiSchema))` — LLM 서비스에서.
 */
export function loadPartial<Schema extends ZodTypeAny>(
  schema: Schema,
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.issues);
  }
  return parsed.data;
}
