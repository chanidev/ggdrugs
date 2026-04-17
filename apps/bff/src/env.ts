import {
  loadPartial,
  coreSchema,
  databaseSchema,
  redisSchema,
  qdrantSchema,
  s3Schema,
  serviceUrlsSchema,
  externalApiSchema,
  sessionSchema,
} from '@ggdrugs/config';

const bffSchema = coreSchema
  .merge(databaseSchema)
  .merge(redisSchema)
  .merge(qdrantSchema)
  .merge(s3Schema)
  .merge(serviceUrlsSchema)
  .merge(externalApiSchema)
  .merge(sessionSchema);

export const env = loadPartial(bffSchema);
export type BffEnv = typeof env;
