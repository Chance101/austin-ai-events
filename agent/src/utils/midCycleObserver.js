/**
 * Addition C — Bounded inner-loop agentic execution.
 *
 * The MidCycleObserver watches scrape results as they come in during
 * a planner-driven cycle and makes bounded, deterministic adjustments
 * to the remaining work. This is the "observe → adjust → continue"
 * loop that makes the pipeline genuinely agentic within a single run.
 *
 * Triggers (deterministic for MVP — no mid-cycle LLM calls):
 *   - parser_error: a planned source threw a structural error
 *   - zero_from_expected: a source the planner explicitly included returned 0
 *   - high_yield: a source returned significantly more events than typical
 *
 * Adjustments (additive only — can add work, never remove completed work):
 *   - Add sibling URLs to the probe queue (same organizer, different path)
 *   - Escalate broken sources to the decision log
 *   - Track prediction deviations for the experiment evaluator
 *
 * Budget: max MAX_ADJUSTMENTS adjustments per cycle.
 *
 * Future upgrade path: replace the deterministic re-plan with a Haiku
 * call that receives the current state and proposes adjustments. The
 * observer interface stays the same.
 */

import { getSupabase } from './supabase.js';

const MAX_ADJUSTMENTS = 5;

/**
 * Create a MidCycleObserver for a planner-driven run.
 *
 * @param {Object} runPlan - The planner's original plan
 * @param {Object} [opts]
 * @param {Function} [opts.onAdjustment] - Callback when an adjustment is made
 * @returns {Object} observer with observe(), getAdjustments(), getSummary()
 */
export function createMidCycleObserver(runPlan, opts = {}) {
  const { onAdjustment } = opts;

  const state = {
    sourcesObserved: 0,
    adjustmentsMade: 0,
    triggers: [],          // [{trigger, source, detail, timestamp}]
    extraUrlsToAdd: [],    // URLs to probe that weren't in the original plan
    deviations: [],        // [{source, predicted, actual, direction}]
    errors: [],            // [{source, error, classified}]
  };

  // Build a set of planned source URLs for quick lookup
  const plannedUrls = new Set([
    ...(runPlan?.config_sources || []).map(s => s.url),
    ...(runPlan?.extra_urls || []).map(s => s.url),
  ]);

  // Extract predictions for deviation tracking
  const predictions = (runPlan?.predictions || []).reduce((map, p) => {
    // Try to extract source-level predictions from hypothesis text
    const sourceMatch = p.hypothesis?.match(/(?:from|on|via)\s+(\S+)/i);
    if (sourceMatch) {
      const countMatch = p.prediction?.match(/(\d+)/);
      if (countMatch) {
        map.set(sourceMatch[1].toLowerCase(), parseInt(countMatch[1], 10));
      }
    }
    return map;
  }, new Map());

  return {
    /**
     * Call after each source scrape completes. The observer checks for
     * triggers and queues adjustments if warranted.
     *
     * @param {Object} source - The source that was scraped
     * @param {Object} result - ScrapeResult (or equivalent with .events, .status)
     * @param {Object} [scrapeError] - Error if the scrape threw
     */
    observe(source, result, scrapeError = null) {
      state.sourcesObserved++;
      const eventCount = result?.events?.length || 0;
      const isPlanned = plannedUrls.has(source.url);

      // Trigger: parser error on a planned source
      if (scrapeError && isPlanned) {
        state.triggers.push({
          trigger: 'parser_error',
          source: source.name,
          url: source.url,
          detail: scrapeError.message,
          timestamp: new Date().toISOString(),
        });
        state.errors.push({
          source: source.name,
          url: source.url,
          error: scrapeError.message,
        });
      }

      // Trigger: zero events from a source the planner explicitly included
      if (eventCount === 0 && isPlanned && !scrapeError) {
        state.triggers.push({
          trigger: 'zero_from_expected',
          source: source.name,
          url: source.url,
          detail: `Planner included this source but got 0 events (status: ${result?.status || 'unknown'})`,
          timestamp: new Date().toISOString(),
        });
      }

      // Trigger: high yield (10+ events from a single source)
      if (eventCount >= 10 && isPlanned) {
        state.triggers.push({
          trigger: 'high_yield',
          source: source.name,
          url: source.url,
          detail: `${eventCount} events — significantly above typical yield`,
          timestamp: new Date().toISOString(),
        });
      }

      // Track prediction deviations
      const sourceKey = source.url?.toLowerCase();
      if (predictions.has(sourceKey)) {
        const predicted = predictions.get(sourceKey);
        state.deviations.push({
          source: source.name,
          url: source.url,
          predicted,
          actual: eventCount,
          direction: eventCount > predicted * 1.5 ? 'over' : eventCount < predicted * 0.5 ? 'under' : 'within',
        });
      }
    },

    /**
     * Called after the main scrape loop and before the web search phase.
     * Processes accumulated triggers and generates adjustments.
     * Returns extra URLs to probe in the remainder of the cycle.
     *
     * @returns {Array<{url, parser_hint, reason}>} extra URLs to add
     */
    async generateAdjustments() {
      if (state.adjustmentsMade >= MAX_ADJUSTMENTS) return [];
      if (state.triggers.length === 0) return [];

      const adjustments = [];

      // For high-yield sources: check if the organizer has other URLs in
      // the sources table that weren't in the plan. If so, add them.
      const highYieldTriggers = state.triggers.filter(t => t.trigger === 'high_yield');
      if (highYieldTriggers.length > 0 && state.adjustmentsMade < MAX_ADJUSTMENTS) {
        const supabase = getSupabase();
        for (const trigger of highYieldTriggers) {
          if (state.adjustmentsMade >= MAX_ADJUSTMENTS) break;

          try {
            // Find sibling sources from the same domain
            const url = new URL(trigger.url);
            const domainPattern = `%${url.hostname}%`;
            const { data: siblings } = await supabase
              .from('sources')
              .select('url, name, source_type')
              .like('url', domainPattern)
              .neq('trust_tier', 'demoted')
              .limit(5);

            for (const sibling of (siblings || [])) {
              if (plannedUrls.has(sibling.url)) continue;
              if (state.adjustmentsMade >= MAX_ADJUSTMENTS) break;

              adjustments.push({
                url: sibling.url,
                parser_hint: sibling.source_type || 'scrape',
                reason: `[inner-loop] Sibling of high-yield source "${trigger.source}" — same domain, not in original plan`,
              });
              state.adjustmentsMade++;

              if (onAdjustment) {
                onAdjustment({
                  type: 'add_sibling_url',
                  trigger: trigger.trigger,
                  source: trigger.source,
                  added_url: sibling.url,
                });
              }
            }
          } catch (error) {
            // Non-critical — continue without sibling discovery
          }
        }
      }

      // For zero-from-expected: look for alternative URLs for the same org
      const zeroTriggers = state.triggers.filter(t => t.trigger === 'zero_from_expected');
      if (zeroTriggers.length > 0 && state.adjustmentsMade < MAX_ADJUSTMENTS) {
        const supabase = getSupabase();
        for (const trigger of zeroTriggers) {
          if (state.adjustmentsMade >= MAX_ADJUSTMENTS) break;

          try {
            const url = new URL(trigger.url);
            const domainPattern = `%${url.hostname}%`;
            const { data: alternatives } = await supabase
              .from('sources')
              .select('url, name, source_type')
              .like('url', domainPattern)
              .neq('url', trigger.url)
              .neq('trust_tier', 'demoted')
              .limit(3);

            for (const alt of (alternatives || [])) {
              if (plannedUrls.has(alt.url)) continue;
              if (state.adjustmentsMade >= MAX_ADJUSTMENTS) break;

              adjustments.push({
                url: alt.url,
                parser_hint: alt.source_type || 'scrape',
                reason: `[inner-loop] Alternative for "${trigger.source}" which returned 0 events`,
              });
              state.adjustmentsMade++;

              if (onAdjustment) {
                onAdjustment({
                  type: 'add_alternative_url',
                  trigger: trigger.trigger,
                  source: trigger.source,
                  added_url: alt.url,
                });
              }
            }
          } catch (error) {
            // Non-critical
          }
        }
      }

      state.extraUrlsToAdd.push(...adjustments);
      return adjustments;
    },

    /**
     * Get a summary of all observations and adjustments for logging.
     */
    getSummary() {
      return {
        sources_observed: state.sourcesObserved,
        triggers_fired: state.triggers.length,
        adjustments_made: state.adjustmentsMade,
        max_adjustments: MAX_ADJUSTMENTS,
        deviations: state.deviations,
        errors: state.errors,
        extra_urls_added: state.extraUrlsToAdd.length,
        triggers: state.triggers,
      };
    },

    /** Check if any adjustments have been queued */
    hasAdjustments() {
      return state.triggers.length > 0;
    },

    /** Get current trigger count */
    get triggerCount() {
      return state.triggers.length;
    },

    /** Get the full trigger list */
    get triggers() {
      return [...state.triggers];
    },
  };
}
