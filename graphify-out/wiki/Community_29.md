# Community 29

> 6 nodes · cohesion 0.40

## Key Concepts

- **loadPartial (per-service schema)** (3 connections) — `packages\config\src\index.ts`
- **env (BffEnv instance)** (3 connections) — `apps\bff\src\env.ts`
- **EnvValidationError** (2 connections) — `packages\config\src\index.ts`
- **loadEnv (full validation)** (2 connections) — `packages\config\src\index.ts`
- **pino logger (env-aware)** (1 connections) — `apps\bff\src\logger.ts`
- **prisma (PrismaClient singleton)** (1 connections) — `apps\bff\src\prisma.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `apps\bff\src\env.ts`
- `apps\bff\src\logger.ts`
- `apps\bff\src\prisma.ts`
- `packages\config\src\index.ts`

## Audit Trail

- EXTRACTED: 10 (83%)
- INFERRED: 2 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*