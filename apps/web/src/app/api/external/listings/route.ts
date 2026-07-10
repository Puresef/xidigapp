import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireApiKey } from '@/lib/api-keys/guard';
import { writeAudit } from '@/lib/audit';
import { queryExternalListings } from '@/lib/external/read';
import { externalListingCreateSchema, externalListingsQuerySchema } from '@/lib/external/schemas';
import { externalDedupKey, resolveExistingTagIds } from '@/lib/external/write';
import { createSeededListing } from '@/lib/seed/content';

/**
 * External directory read (GET, `read` scope) + seeded listing create
 * (POST, `listings:write` scope). Reads are public-safe (published only,
 * discovery fields, no contacts/address); writes are idempotent + audited and
 * land as UNCLAIMED seeded listings (real owners can claim them, §18).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/external/listings';

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(request, 'read', ROUTE);
    const filters = externalListingsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const page = await queryExternalListings(ctx.admin, filters);
    return apiOk(page);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(request, 'listings:write', ROUTE);
    const input = externalListingCreateSchema.parse(await request.json());

    // Resolve + validate the category slug. Unknown slug is a bad request.
    const { data: category } = await ctx.admin
      .from('listing_categories')
      .select('id')
      .eq('slug', input.category)
      .maybeSingle();
    if (!category) throw new ApiError('invalid_request', 400);

    const tagIds = await resolveExistingTagIds(ctx.admin, input.tags);
    const dedupKey = externalDedupKey(ctx.keyId, input.idempotencyKey, {
      businessName: input.businessName,
      category: input.category,
    });

    const { listingId, created } = await createSeededListing(ctx.admin, {
      source: input.source,
      dedupKey,
      apiKeyId: ctx.keyId,
      businessName: input.businessName,
      categoryId: category.id,
      shortDescription: input.shortDescription ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      landmark: input.landmark ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      tagIds,
    });

    await writeAudit(ctx.admin, {
      actorUserId: ctx.ownerUserId,
      apiKeyId: ctx.keyId,
      action: created ? 'external.listing.created' : 'external.listing.idempotent',
      targetType: 'listing',
      targetId: listingId,
      metadata: { source: input.source },
    });

    return apiOk({ id: listingId, created, source: input.source }, created ? 201 : 200);
  } catch (error) {
    return handleApiError(error);
  }
}
