import { MentorResidenceCard } from '@/components/mentor/mentor-residence-card';
import { SuggestedFollows } from '@/components/profile/suggested-follows';

/**
 * Frame 9c community-module stack for Madal (Munaasabado Task 10): the
 * "Kula talin" follow suggestion + the mentor-in-residence booking card.
 *
 * The page mounts this TWICE — `placement="rail"` inside the desktop
 * `aside.xidig-plaza-rail` and `placement="inline"` inside the feed's
 * `li.xidig-plaza-inline` — and CSS shows exactly one per breakpoint
 * (nav-shells precedent: both in the tree, media-query gated). Every module
 * here must therefore be quiet-when-empty, and both are: the follow module
 * renders nothing without a reasoned suggestion, the mentor card nothing
 * without an active residency — so a signed-out/empty render collapses to
 * two empty wrappers, not a hole with a heading.
 *
 * CSS contract (final-review fix 5): when BOTH modules render null the
 * wrapper div must be truly `:empty` — no whitespace text nodes — because
 * globals.css hides `.xidig-plaza-modules:empty` (and collapses the desktop
 * rail column / the inline feed row around it). Locked by
 * community-rail.test.tsx; keep children as direct JSX elements, never
 * string interpolation inside the wrapper.
 */

/** Thin named wrapper so the brief's module composition reads at the call site. */
export function FollowSuggestionModule() {
  return <SuggestedFollows variant="module" />;
}

export function CommunityRail({ placement }: { placement: 'rail' | 'inline' }) {
  return (
    <div className="xidig-plaza-modules" data-placement={placement}>
      <FollowSuggestionModule />
      <MentorResidenceCard />
    </div>
  );
}
