import type { AnigaView } from '@/lib/aniga/view';
import { getT } from '@/lib/locale';

/**
 * Xogta — the owner's facts card (docs/aniga-modules.md, ruled 11 Aug).
 *
 * Frame 10d drew this card for VISITORS. It does not ship that way: every fact
 * it held either already renders elsewhere for every viewer (tenure in
 * `.xidig-profile__counts`, location as the header subtitle) or has no data
 * model at all (languages). What survives is the owner's card — the two facts
 * that decide how a member gets FOUND and that the owner structurally cannot
 * see any other way.
 *
 * Absence is structural, not conditional styling: `getAnigaView` returns
 * `ownerFacts: null` for every viewer but the owner and never runs the reads,
 * so there is no visitor DOM node to un-hide and no fold state in a visitor's
 * payload. That last part is the privacy property this card rests on — a
 * visitor who could tell `hidden` apart from never-entered would have learned
 * that this member deliberately hid something, which is what hiding was for.
 *
 * The location row MIRRORS the visitor's view: `getMemberProfileView` skips
 * the privacy fold for the owner (a setting must never hide a member's data
 * from themselves), so without this card a member who chose `hidden` at
 * onboarding reads their own city on their own page forever and never learns
 * that nobody local can find them.
 */

/**
 * Lane labels are several values in one field, not a sentence, so they are
 * joined by a separator CHARACTER — the same middle dot the Suuq card and the
 * post byline already use. A connecting word would be copy invented in TSX,
 * which is exactly what MessageKeys exist to prevent.
 */
const LANE_SEPARATOR = ' · ';

export interface AnigaFactsProps {
  /**
   * Owner-only. Null for every other viewer — and the component then emits no
   * DOM at all, which is the point of the prop being nullable rather than the
   * caller being trusted to omit the element.
   */
  facts: AnigaView['ownerFacts'];
}

export async function AnigaFacts({ facts }: AnigaFactsProps) {
  // Checked before `getT()`: the visitor path must cost nothing and reach
  // nothing. No wrapper, no aria-hidden node, no empty section.
  if (!facts) return null;
  // No lanes and nothing folded away is nothing to say, and an empty card is a
  // promise of content. Zero rows → no <section>, the same discipline as
  // `publishedModules()` and `AnigaPrivateStats`.
  if (facts.lanes.length === 0 && facts.fold === null) return null;

  const t = await getT();

  // Only when the fold actually bites — a notice that never changes teaches
  // nothing. `region` folds the city away and names the country instead, so an
  // owner who never stored one has nothing left for a visitor to see: the true
  // sentence there is the hidden one, not a region line with a hole in it.
  const foldNote =
    facts.fold === null
      ? null
      : facts.fold === 'region' && facts.place !== null
        ? t('profile.factsFoldRegion', { place: facts.place })
        : t('profile.factsFoldHidden');

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{t('profile.factsTitle')}</h2>

      {/* Self-declared facts are a definition list, NEVER `.xidig-tag` pills:
          in this product a pill is the typography of attested evidence —
          endorsement counts, badges, verification, Garab tiers — so a
          ticked-checkbox lane wearing one would quietly tell the reader that a
          stranger vouched for it. The demotion IS the epistemic signal, and it
          fixes a real defect on the way: the chips it replaces carried no
          label association at all. */}
      <dl className="xidig-afacts">
        {facts.lanes.length > 0 ? (
          <>
            <dt>{t('profile.lanesLabel')}</dt>
            {/* Labels, not slugs: the read path has shown members
                `halal-finance` since the label columns landed. */}
            <dd>{facts.lanes.map((lane) => lane.label).join(LANE_SEPARATOR)}</dd>
          </>
        ) : null}
      </dl>

      {/* No location ROW, deliberately. It would be redundant in every state
          the fold can be in: unfolded it repeats the header subtitle verbatim,
          `region` repeats the note directly below it ("Goobta: UK" over
          "Visitors see UK only"), and `hidden` leaves nothing to print. The
          mirror is a thing worth saying only where it DIVERGES from what the
          member typed, and there it is a sentence, not a label-value pair. */}

      {foldNote ? <p className="xidig-card__meta">{foldNote}</p> : null}

      {/* Lanes are a discovery filter, not an achievement. Without the note the
          row reads as a claim the member is making about themselves. */}
      {facts.lanes.length > 0 ? (
        <p className="xidig-card__meta">{t('profile.factsLanesNote')}</p>
      ) : null}
    </section>
  );
}

export default AnigaFacts;
