/**
 * RunDecisionLog — Lightweight in-memory collector for pipeline decisions.
 *
 * Accumulates every accept/reject/duplicate/skip decision during the run.
 * No DB calls during the pipeline — call getSummary() once at the end.
 */
export class RunDecisionLog {
  constructor() {
    this.decisions = [];
  }

  /**
   * Log a pipeline decision.
   * @param {Object} opts
   * @param {string} opts.event     - Event title (truncated for storage)
   * @param {string} opts.source    - Source name or id
   * @param {string} opts.stage     - Pipeline stage: pre_filter | dedup_hash | dedup_fuzzy | dedup_claude | location_check | validation | classification | upsert
   * @param {string} opts.outcome   - accepted | rejected | duplicate | updated | skipped | error
   * @param {string} [opts.reason]  - Human-readable reason
   * @param {Object} [opts.details] - Extra context (e.g., { claudeCalled: true })
   */
  log({ event, source, stage, outcome, reason, details }) {
    this.decisions.push({
      event: (event || '').substring(0, 80),
      source: source || 'unknown',
      stage,
      outcome,
      reason: reason || null,
      details: details || null,
      timestamp: Date.now(),
    });
  }

  /**
   * Produce an aggregate summary suitable for storage on agent_runs.
   * Returns a compact object — raw decisions are NOT stored.
   */
  getSummary() {
    const bySource = {};
    const byStage = {};
    const rejectionReasons = {};
    const dupLayers = {};
    const claudeCallsBySource = {};

    for (const d of this.decisions) {
      // --- by source ---
      if (!bySource[d.source]) {
        bySource[d.source] = { accepted: 0, rejected: 0, duplicated: 0, updated: 0, skipped: 0, error: 0, reasons: {} };
      }
      const src = bySource[d.source];
      if (d.outcome === 'accepted') src.accepted++;
      else if (d.outcome === 'rejected') src.rejected++;
      else if (d.outcome === 'duplicate') src.duplicated++;
      else if (d.outcome === 'updated') src.updated++;
      else if (d.outcome === 'skipped') src.skipped++;
      else if (d.outcome === 'error') src.error++;

      if (d.reason && (d.outcome === 'rejected' || d.outcome === 'skipped')) {
        src.reasons[d.reason] = (src.reasons[d.reason] || 0) + 1;
      }

      // --- by stage ---
      byStage[d.stage] = (byStage[d.stage] || 0) + 1;

      // --- rejection reasons (global) ---
      if ((d.outcome === 'rejected' || d.outcome === 'skipped') && d.reason) {
        if (!rejectionReasons[d.reason]) {
          rejectionReasons[d.reason] = { count: 0, sources: new Set() };
        }
        rejectionReasons[d.reason].count++;
        rejectionReasons[d.reason].sources.add(d.source);
      }

      // --- duplicate layers ---
      if (d.outcome === 'duplicate') {
        const layer = d.stage; // dedup_hash, dedup_fuzzy, dedup_claude
        if (!dupLayers[layer]) dupLayers[layer] = { count: 0, sources: {} };
        dupLayers[layer].count++;
        dupLayers[layer].sources[d.source] = (dupLayers[layer].sources[d.source] || 0) + 1;
      }

      // --- Claude calls by source ---
      if (d.details?.claudeCalled) {
        claudeCallsBySource[d.source] = (claudeCallsBySource[d.source] || 0) + 1;
      }
    }

    // Top rejection reasons (sorted by count, serializable)
    const topRejectionReasons = Object.entries(rejectionReasons)
      .map(([reason, { count, sources }]) => ({ reason, count, sources: [...sources] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top dup sources
    const topDupSources = Object.entries(dupLayers)
      .flatMap(([layer, { sources }]) =>
        Object.entries(sources).map(([source, count]) => ({ source, count, layer }))
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Cost efficiency per source (est ~$0.001 per Haiku call)
    const HAIKU_COST = 0.001;
    const costEfficiency = { bySource: {} };
    let totalClaudeCalls = 0;
    let totalEventsAccepted = 0;

    for (const [source, calls] of Object.entries(claudeCallsBySource)) {
      const accepted = bySource[source]?.accepted || 0;
      const estCost = Math.round(calls * HAIKU_COST * 10000) / 10000;
      costEfficiency.bySource[source] = {
        claudeCalls: calls,
        eventsAccepted: accepted,
        estCost,
        costPerEvent: accepted > 0 ? Math.round((estCost / accepted) * 10000) / 10000 : null,
      };
      totalClaudeCalls += calls;
      totalEventsAccepted += accepted;
    }

    const totalEstCost = Math.round(totalClaudeCalls * HAIKU_COST * 10000) / 10000;
    costEfficiency.totalClaudeCalls = totalClaudeCalls;
    costEfficiency.totalEstCost = totalEstCost;
    costEfficiency.totalEventsAccepted = totalEventsAccepted;
    costEfficiency.avgCostPerEvent = totalEventsAccepted > 0
      ? Math.round((totalEstCost / totalEventsAccepted) * 10000) / 10000
      : null;

    return {
      totalDecisions: this.decisions.length,
      bySource,
      byStage,
      topRejectionReasons,
      topDupSources,
      costEfficiency,
    };
  }
}
