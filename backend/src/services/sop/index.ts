/**
 * SOP Services Index
 * Exports all SOP generation services
 */

export { SopService, getSopService } from './sop.service.js';

export type {
  SopDraft,
  SopContent,
  SopMetadata,
  SopGenerationParams,
  SopGenerationRequest,
  CreateSopDraftInput,
  UpdateSopDraftInput,
  SopProcedure,
  SopResponsibility,
  SopQualityCheck,
  SopException,
  SopReviewEntry,
  SopTemplate,
} from '../../models/SopDraft.js';

export {
  SOP_DEFAULTS,
  incrementVersion,
  calculateCompletenessScore,
  validateSopContent,
} from '../../models/SopDraft.js';
