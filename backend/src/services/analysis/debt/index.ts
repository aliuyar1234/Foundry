/**
 * Debt Analysis Services
 * Barrel export for all debt calculation modules
 */

export { calculateProcessDebt, ProcessDebtOptions } from './processDebt.js';
export { calculateKnowledgeDebt, KnowledgeDebtOptions } from './knowledgeDebt.js';
export { calculateDataDebt, DataDebtOptions } from './dataDebt.js';
export { calculateTechnicalDebt, TechnicalDebtOptions } from './technicalDebt.js';
export { calculateCommunicationDebt, CommunicationDebtOptions } from './communicationDebt.js';
export {
  calculateOrgDebtScore,
  getDebtScoreHistory,
  getLatestDebtScore,
  compareDebtScores,
} from './debtScoreService.js';
export { estimateDebtCost, calculateFixROI, CostEstimatorOptions } from './costEstimator.js';
