import type { ReactNode } from 'react';

import { publishedModules, type AnigaModuleId, type AnigaModuleState } from '@/lib/aniga/modules';
import type { AnigaView } from '@/lib/aniga/view';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';

import { HelperModule } from './modules/helper-module';
import { LinksModule } from './modules/links-module';
import { LookingForModule } from './modules/looking-for-module';
import { MetricsModule } from './modules/metrics-module';
import { ShowcaseModule } from './modules/showcase-module';
import { SkillsModule } from './modules/skills-module';
import { SpacesModule } from './modules/spaces-module';
import { SuuqModule } from './modules/suuq-module';

/**
 * The module column — everything below the bio, in the order the member stored
 * (spec §1, frames 10a own / 10c visitor).
 *
 * This file is the renderer half of acceptance A2, and the reason it maps over
 * a projection instead of rendering eight components with `visible &&` guards:
 * a guard inside a module still ships the module's own frame, and "hidden"
 * would be a styling decision one CSS mistake away from being visible. Here the
 * array IS the page — a module that is not in it cannot emit a node, a class,
 * a data attribute, or a comment.
 *
 * Two projections, and the difference is deliberate:
 *
 *  - **visitor** (`member` / `anon`) — `publishedModules()`: visible AND not
 *    flag-held. Nothing else reaches the DOM.
 *  - **owner** — the published set PLUS the flag-held modules, which render as
 *    locked cards (10a: Tirakoobka sits there dashed and inert). A module the
 *    owner has switched off is absent from their page too; the module manager
 *    is where a hidden module lives, so the owner's page reads as what visitors
 *    actually meet rather than as a control panel.
 *
 * Each module still owns its own emptiness: with nothing to show, a module
 * returns null for a visitor and keeps the card for the owner (where the "add"
 * move lives). So being in this array is permission to render, never a promise
 * that a node appears.
 */

/** Where the owner edits profile content. One surface, §27's canonical href. */
const EDIT_HREF = '/settings/profile';
/** The Suuq listing is created in Suuq, not in profile settings. */
const SUUQ_ADD_HREF = '/suuq/new';

export interface AnigaModulesProps {
  view: AnigaView;
  viewer: 'owner' | 'member' | 'anon';
  /** Viewer Lite prefs (§22) — every module image rides MediaSlot. */
  prefs: LitePrefs;
  /**
   * Per-module owner visibility toggles, supplied by whoever holds the whole
   * ordered set (the module manager). A caller that omits them gets no eyes,
   * and the manager stays the toggle surface — the same boundary ModuleCard
   * draws, kept intact here rather than re-decided per module.
   */
  visibilityToggles?: Partial<Record<AnigaModuleId, ReactNode>>;
  /**
   * The visitor's "Marag-fur" control. Endorsing writes against ANOTHER
   * member's profile, so the request belongs to the caller, not to the column.
   */
  endorseAction?: ReactNode;
}

/**
 * What this viewer's page is allowed to render, in stored order.
 *
 * Exported because it is the assertion point: a test can compare the projection
 * to the DOM sequence and catch a renderer that quietly re-sorts.
 */
export function anigaModulesForViewer(
  modules: readonly AnigaModuleState[],
  viewer: AnigaModulesProps['viewer'],
): AnigaModuleState[] {
  if (viewer !== 'owner') return publishedModules(modules);
  // The owner keeps the flag-held row (10a) — its lock is a platform statement
  // addressed to them. Their own hidden modules live in the manager.
  return modules.filter((module) => module.visible || module.lockedByFlag);
}

export async function AnigaModules({
  view,
  viewer,
  prefs,
  visibilityToggles,
  endorseAction,
}: AnigaModulesProps) {
  const states = anigaModulesForViewer(view.modules, viewer);
  const t = await getT();
  const name = view.base.profile.display_name;

  return (
    <div className="xidig-aniga__modules">
      {states.map((state) => {
        const visibilityToggle = visibilityToggles?.[state.id];
        switch (state.id) {
          case 'showcase':
            return (
              <ShowcaseModule
                key={state.id}
                items={view.showcase}
                viewer={viewer}
                displayName={name}
                prefs={prefs}
                addHref={EDIT_HREF}
                visibilityToggle={visibilityToggle}
              />
            );
          case 'skills':
            return (
              <SkillsModule
                key={state.id}
                skills={view.skills}
                viewer={viewer}
                addHref={EDIT_HREF}
                endorseAction={endorseAction}
                visibilityToggle={visibilityToggle}
              />
            );
          case 'links':
            return (
              <LinksModule
                key={state.id}
                links={view.links}
                viewer={viewer}
                addHref={EDIT_HREF}
                prefs={prefs}
                visibilityToggle={visibilityToggle}
              />
            );
          case 'looking_for':
            return (
              <LookingForModule
                key={state.id}
                slugs={view.lookingFor.slugs}
                matches={view.lookingFor.matches}
                viewer={viewer}
                visibilityToggle={visibilityToggle}
              />
            );
          case 'spaces':
            return (
              <SpacesModule
                key={state.id}
                pins={view.base.pins}
                viewer={viewer}
                editHref={EDIT_HREF}
                visibilityToggle={visibilityToggle}
              />
            );
          case 'helper':
            return (
              <HelperModule
                key={state.id}
                entries={view.helper}
                viewer={viewer}
                displayName={name}
                prefs={prefs}
                visibilityToggle={visibilityToggle}
              />
            );
          case 'suuq':
            return (
              <SuuqModule
                key={state.id}
                listing={view.suuq?.listing ?? null}
                testimonial={view.suuq?.testimonial ?? null}
                viewer={viewer}
                prefs={prefs}
                addHref={SUUQ_ADD_HREF}
                visibilityToggle={visibilityToggle}
              />
            );
          case 'metrics':
            return (
              <MetricsModule
                key={state.id}
                metrics={view.metrics}
                viewer={viewer}
                lockedByFlag={state.lockedByFlag}
                visibilityToggle={visibilityToggle}
              />
            );
        }
      })}

      {/* 10c's trailing note. It states the rule the page just followed —
          the member chose this order, and there are no follower counts to
          find — so it is addressed to the visitor and only when there is a
          column above it to describe. */}
      {viewer !== 'owner' && states.length > 0 ? (
        /* The house muted-meta class rather than the module shell's own
           `__note`: this sentence belongs to the column, not to a card. */
        <p className="xidig-card__meta">{t('profile.visitorOrderNote', { name })}</p>
      ) : null}
    </div>
  );
}

export default AnigaModules;
