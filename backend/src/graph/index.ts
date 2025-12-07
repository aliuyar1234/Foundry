/**
 * Knowledge Graph Module
 * Exports all graph-related functionality
 */

// Connection management
export {
  initializeNeo4j,
  getDriver,
  getSession,
  closeNeo4j,
  testConnection,
  runQuery,
  runWriteTransaction,
  runReadTransaction,
  createIndexes,
  createConstraints,
  initializeSchema,
} from './connection.js';

// Person model
export {
  PersonNode,
  CreatePersonInput,
  PersonWithMetrics,
  upsertPerson,
  bulkUpsertPersons,
  findPersonByEmail,
  findPersonsByOrganization,
  findPersonsWithMetrics,
  searchPersons,
  deletePerson,
  countPersons,
} from './models/person.js';

// Communication relationships
export {
  CommunicatesWithRelation,
  CreateCommunicationInput,
  recordCommunication,
  bulkRecordCommunications,
  getCommunicationsForPerson,
  getTopCommunicationPairs,
  calculateCommunicationStrength,
} from './relationships/communicatesWith.js';

// Reporting relationships
export {
  ReportsToRelation,
  InferredReportingInput,
  setReportingRelationship,
  setInferredReporting,
  bulkSetReportingRelationships,
  getManager,
  getDirectReports,
  getReportingChain,
  getOrganizationHierarchy,
  removeReportingRelationship,
  inferReportingRelationships,
} from './relationships/reportsTo.js';
