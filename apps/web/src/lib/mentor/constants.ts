/**
 * Mentor slot display timezone (Ruling 7, 12 Aug — F2).
 *
 * `mentor_slots` carries no per-residency timezone column, so every slot
 * instant is rendered and notified against this single fixed UTC constant,
 * shared by the booking route and the booking island so the two can never
 * disagree. This is an explicit F2 constraint, not a permanent design:
 * Ruling 7 requires a `mentor_slots.timezone` column (or equivalent) before
 * slot scheduling opens up to broader host-controlled timezones.
 *
 * Because the zone is fixed rather than per-residency, every member-facing
 * rendering of a slot time MUST pair it with an explicit UTC marker (see
 * `mentor.slotTimeUtc` in the i18n dictionaries) rather than a bare
 * "{weekday} {time}" — the zone isn't self-evident to a viewer who isn't in
 * it.
 */
export const MENTOR_SLOT_TIMEZONE = 'UTC';
