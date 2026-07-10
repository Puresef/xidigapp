import { z } from 'zod';

import { isApiScope } from './scopes';

/**
 * Validation for the key-management API (PRD §21). A member names a key and
 * requests a set of scopes; the route enforces which scopes they may actually
 * mint (members can never mint `admin`). Expiry is optional (days from now).
 */
export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z
    .array(z.string())
    .min(1)
    .max(8)
    .refine((s) => s.every(isApiScope), { message: 'unknown scope' }),
  /** Days until expiry; omitted = never expires. */
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
