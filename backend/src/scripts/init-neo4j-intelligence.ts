/**
 * Neo4j Schema Extensions for Intelligence Features (T018)
 * Creates Expertise and Decision nodes with new relationships
 */

import { getNeo4jDriver, runQuery } from '../graph/connection.js';
import { logger } from '../lib/logger.js';

// Constraint and index definitions for new node types
const SCHEMA_DEFINITIONS = {
  constraints: [
    // Expertise node constraints
    {
      name: 'expertise_id_unique',
      query: 'CREATE CONSTRAINT expertise_id_unique IF NOT EXISTS FOR (e:Expertise) REQUIRE e.id IS UNIQUE',
    },
    // Decision node constraints
    {
      name: 'decision_id_unique',
      query: 'CREATE CONSTRAINT decision_id_unique IF NOT EXISTS FOR (d:Decision) REQUIRE d.id IS UNIQUE',
    },
  ],
  indexes: [
    // Expertise indexes
    {
      name: 'expertise_name_idx',
      query: 'CREATE INDEX expertise_name_idx IF NOT EXISTS FOR (e:Expertise) ON (e.name)',
    },
    {
      name: 'expertise_category_idx',
      query: 'CREATE INDEX expertise_category_idx IF NOT EXISTS FOR (e:Expertise) ON (e.category)',
    },
    {
      name: 'expertise_tenant_idx',
      query: 'CREATE INDEX expertise_tenant_idx IF NOT EXISTS FOR (e:Expertise) ON (e.tenantId)',
    },
    // Decision indexes
    {
      name: 'decision_title_idx',
      query: 'CREATE INDEX decision_title_idx IF NOT EXISTS FOR (d:Decision) ON (d.title)',
    },
    {
      name: 'decision_date_idx',
      query: 'CREATE INDEX decision_date_idx IF NOT EXISTS FOR (d:Decision) ON (d.decisionDate)',
    },
    {
      name: 'decision_tenant_idx',
      query: 'CREATE INDEX decision_tenant_idx IF NOT EXISTS FOR (d:Decision) ON (d.tenantId)',
    },
    // Relationship indexes for faster traversals
    {
      name: 'has_expertise_confidence_idx',
      query: 'CREATE INDEX has_expertise_confidence_idx IF NOT EXISTS FOR ()-[r:HAS_EXPERTISE]-() ON (r.confidence)',
    },
    {
      name: 'participated_in_role_idx',
      query: 'CREATE INDEX participated_in_role_idx IF NOT EXISTS FOR ()-[r:PARTICIPATED_IN]-() ON (r.role)',
    },
  ],
};

async function createConstraints(): Promise<void> {
  logger.info('Creating Neo4j constraints for intelligence features');

  for (const constraint of SCHEMA_DEFINITIONS.constraints) {
    try {
      await runQuery(constraint.query);
      logger.debug({ constraintName: constraint.name }, 'Constraint created or already exists');
    } catch (error) {
      logger.warn({ constraintName: constraint.name, error }, 'Failed to create constraint');
    }
  }

  logger.info('Neo4j constraints creation complete');
}

async function createIndexes(): Promise<void> {
  logger.info('Creating Neo4j indexes for intelligence features');

  for (const index of SCHEMA_DEFINITIONS.indexes) {
    try {
      await runQuery(index.query);
      logger.debug({ indexName: index.name }, 'Index created or already exists');
    } catch (error) {
      logger.warn({ indexName: index.name, error }, 'Failed to create index');
    }
  }

  logger.info('Neo4j indexes creation complete');
}

async function verifySchema(): Promise<void> {
  logger.info('Verifying Neo4j schema');

  // List all constraints
  const constraintsResult = await runQuery('SHOW CONSTRAINTS');
  logger.info(
    { count: constraintsResult.records.length },
    'Total constraints in database'
  );

  // List all indexes
  const indexesResult = await runQuery('SHOW INDEXES');
  logger.info(
    { count: indexesResult.records.length },
    'Total indexes in database'
  );
}

export async function initializeNeo4jIntelligenceSchema(): Promise<void> {
  logger.info('Starting Neo4j intelligence schema initialization');

  try {
    // Verify connection
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    logger.info('Neo4j connection verified');

    // Create schema elements
    await createConstraints();
    await createIndexes();

    // Verify
    await verifySchema();

    logger.info('Neo4j intelligence schema initialization complete');
  } catch (error) {
    logger.error({ error }, 'Neo4j schema initialization failed');
    throw error;
  }
}

// Example queries for the new schema (for documentation)
export const INTELLIGENCE_QUERIES = {
  // Create an expertise node
  createExpertise: `
    MERGE (e:Expertise {name: $name, category: $category, tenantId: $tenantId})
    ON CREATE SET e.id = randomUUID(), e.createdAt = datetime()
    RETURN e
  `,

  // Create a decision node
  createDecision: `
    CREATE (d:Decision {
      id: $id,
      title: $title,
      outcome: $outcome,
      decisionDate: datetime($decisionDate),
      tenantId: $tenantId,
      createdAt: datetime()
    })
    RETURN d
  `,

  // Link person to expertise
  linkPersonExpertise: `
    MATCH (p:Person {id: $personId})
    MATCH (e:Expertise {id: $expertiseId})
    MERGE (p)-[r:HAS_EXPERTISE]->(e)
    ON CREATE SET r.confidence = $confidence, r.sources = $sources, r.createdAt = datetime()
    ON MATCH SET r.confidence = $confidence, r.sources = r.sources + $sources, r.updatedAt = datetime()
    RETURN r
  `,

  // Link person to decision participation
  linkPersonDecision: `
    MATCH (p:Person {id: $personId})
    MATCH (d:Decision {id: $decisionId})
    MERGE (p)-[r:PARTICIPATED_IN]->(d)
    ON CREATE SET r.role = $role, r.createdAt = datetime()
    RETURN r
  `,

  // Link related decisions
  linkDecisions: `
    MATCH (d1:Decision {id: $decisionId1})
    MATCH (d2:Decision {id: $decisionId2})
    MERGE (d1)-[r:INFLUENCED]->(d2)
    ON CREATE SET r.createdAt = datetime()
    RETURN r
  `,

  // Find expertise for a person
  findPersonExpertise: `
    MATCH (p:Person {id: $personId})-[r:HAS_EXPERTISE]->(e:Expertise)
    RETURN e.name AS expertise, e.category AS category, r.confidence AS confidence
    ORDER BY r.confidence DESC
  `,

  // Find decisions a person participated in
  findPersonDecisions: `
    MATCH (p:Person {id: $personId})-[r:PARTICIPATED_IN]->(d:Decision)
    RETURN d.title AS decision, d.outcome AS outcome, r.role AS role, d.decisionDate AS date
    ORDER BY d.decisionDate DESC
  `,

  // Find experts for a topic
  findExperts: `
    MATCH (p:Person)-[r:HAS_EXPERTISE]->(e:Expertise)
    WHERE e.name CONTAINS $topic OR e.category = $category
    AND e.tenantId = $tenantId
    RETURN p.name AS person, p.id AS personId, e.name AS expertise, r.confidence AS confidence
    ORDER BY r.confidence DESC
    LIMIT $limit
  `,
};

// Main entry point when run directly
async function main(): Promise<void> {
  try {
    await initializeNeo4jIntelligenceSchema();
    logger.info('Neo4j intelligence schema initialization completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Neo4j intelligence schema initialization failed');
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
