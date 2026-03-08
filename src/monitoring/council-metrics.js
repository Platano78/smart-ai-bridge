/**
 * @module CouncilMetrics
 */

/**
 * Class to track council execution statistics.
 */
class CouncilMetrics {
  /**
   * Initialize CouncilMetrics.
   */
  constructor() {
    this.totalCouncils = 0;
    this.successfulCouncils = 0;
    this.failedCouncils = 0;
    this.avgBackendsUsed = 0;
    this.avgProcessingTime = 0;
    this.modeDistribution = {};
  }

  /**
   * Record a council execution.
   * @param {string} mode - The mode of the council.
   * @param {number} backendsUsed - Number of backends used.
   * @param {number} processingTime - Processing time in milliseconds.
   * @param {boolean} success - Whether the council execution was successful.
   * @throws {Error} If input parameters are invalid.
   */
  recordCouncil(mode, backendsUsed, processingTime, success) {
    if (typeof mode !== 'string' || typeof backendsUsed !== 'number' || 
        typeof processingTime !== 'number' || typeof success !== 'boolean') {
      throw new Error('Invalid input parameters');
    }

    this.totalCouncils++;
    if (success) {
      this.successfulCouncils++;
    } else {
      this.failedCouncils++;
    }

    // Update averages
    const total = this.totalCouncils;
    this.avgBackendsUsed = (this.avgBackendsUsed * (total - 1) + backendsUsed) / total;
    this.avgProcessingTime = (this.avgProcessingTime * (total - 1) + processingTime) / total;

    // Update mode distribution
    this.modeDistribution[mode] = (this.modeDistribution[mode] || 0) + 1;
  }

  /**
   * Get a summary of council execution statistics.
   * @returns {Object} Summary of council metrics.
   */
  getSummary() {
    return {
      totalCouncils: this.totalCouncils,
      successRate: this.totalCouncils > 0 ? 
        `${((this.successfulCouncils / this.totalCouncils) * 100).toFixed(1)}%` : 'N/A',
      avgBackendsUsed: Number(this.avgBackendsUsed.toFixed(1)),
      avgProcessingTime: `${Math.round(this.avgProcessingTime)}ms`,
      modeDistribution: this.modeDistribution
    };
  }
}

export { CouncilMetrics };