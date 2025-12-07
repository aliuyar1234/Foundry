/**
 * Neo4j Graph Database Setup
 * Creates constraints, indexes, and initial schema for the knowledge graph
 */

import neo4j, { Driver, Session } from 'neo4j-driver';

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
}

/**
 * Initialize Neo4j database with constraints and indexes
 */
export async function setupNeo4jSchema(driver: Driver): Promise<void> {
  const session = driver.session();

  try {
    // Create constraints (which also create indexes)
    await createConstraints(session);

    // Create additional indexes for query performance
    await createIndexes(session);

    console.info('Neo4j schema setup completed successfully');
  } finally {
    await session.close();
  }
}

async function createConstraints(session: Session): Promise<void> {
  const constraints = [
    // Person constraints
    `CREATE CONSTRAINT person_id IF NOT EXISTS
     FOR (p:Person) REQUIRE p.id IS UNIQUE`,

    `CREATE CONSTRAINT person_email IF NOT EXISTS
     FOR (p:Person) REQUIRE p.email IS UNIQUE`,

    // Process constraints
    `CREATE CONSTRAINT process_id IF NOT EXISTS
     FOR (p:Process) REQUIRE p.id IS UNIQUE`,

    // ProcessStep constraints
    `CREATE CONSTRAINT processstep_id IF NOT EXISTS
     FOR (ps:ProcessStep) REQUIRE ps.id IS UNIQUE`,

    // Event constraints (for linked events in graph)
    `CREATE CONSTRAINT event_id IF NOT EXISTS
     FOR (e:Event) REQUIRE e.id IS UNIQUE`,

    // Document constraints
    `CREATE CONSTRAINT document_id IF NOT EXISTS
     FOR (d:Document) REQUIRE d.id IS UNIQUE`,

    // ==========================================================================
    // OPERATE Tier Extensions (T017-T020)
    // ==========================================================================

    // T017: ExpertiseProfile node constraints
    `CREATE CONSTRAINT expertiseprofile_id IF NOT EXISTS
     FOR (ep:ExpertiseProfile) REQUIRE ep.id IS UNIQUE`,

    `CREATE CONSTRAINT expertiseprofile_person IF NOT EXISTS
     FOR (ep:ExpertiseProfile) REQUIRE ep.personId IS UNIQUE`,

    // T018: WorkloadSnapshot node constraints
    `CREATE CONSTRAINT workloadsnapshot_id IF NOT EXISTS
     FOR (ws:WorkloadSnapshot) REQUIRE ws.id IS UNIQUE`,

    // Skill node for expertise graph
    `CREATE CONSTRAINT skill_id IF NOT EXISTS
     FOR (s:Skill) REQUIRE s.id IS UNIQUE`,

    // Domain node for expertise categorization
    `CREATE CONSTRAINT domain_id IF NOT EXISTS
     FOR (d:Domain) REQUIRE d.id IS UNIQUE`,
  ];

  for (const constraint of constraints) {
    try {
      await session.run(constraint);
    } catch (error) {
      // Constraint may already exist, which is fine
      if (!(error instanceof Error) || !error.message.includes('already exists')) {
        throw error;
      }
    }
  }
}

async function createIndexes(session: Session): Promise<void> {
  const indexes = [
    // Person indexes
    `CREATE INDEX person_org_id IF NOT EXISTS
     FOR (p:Person) ON (p.organizationId)`,

    `CREATE INDEX person_department IF NOT EXISTS
     FOR (p:Person) ON (p.department)`,

    `CREATE INDEX person_external IF NOT EXISTS
     FOR (p:Person) ON (p.isExternal)`,

    // Process indexes
    `CREATE INDEX process_org_id IF NOT EXISTS
     FOR (p:Process) ON (p.organizationId)`,

    `CREATE INDEX process_name IF NOT EXISTS
     FOR (p:Process) ON (p.name)`,

    // ProcessStep indexes
    `CREATE INDEX processstep_process IF NOT EXISTS
     FOR (ps:ProcessStep) ON (ps.processId)`,

    `CREATE INDEX processstep_order IF NOT EXISTS
     FOR (ps:ProcessStep) ON (ps.stepOrder)`,

    // Event indexes
    `CREATE INDEX event_org_id IF NOT EXISTS
     FOR (e:Event) ON (e.organizationId)`,

    `CREATE INDEX event_timestamp IF NOT EXISTS
     FOR (e:Event) ON (e.timestamp)`,

    `CREATE INDEX event_type IF NOT EXISTS
     FOR (e:Event) ON (e.type)`,

    // Composite indexes for common queries
    `CREATE INDEX person_org_dept IF NOT EXISTS
     FOR (p:Person) ON (p.organizationId, p.department)`,

    `CREATE INDEX event_org_type IF NOT EXISTS
     FOR (e:Event) ON (e.organizationId, e.type)`,

    // ==========================================================================
    // OPERATE Tier Indexes (T017-T020)
    // ==========================================================================

    // T017: ExpertiseProfile indexes
    `CREATE INDEX expertiseprofile_org IF NOT EXISTS
     FOR (ep:ExpertiseProfile) ON (ep.organizationId)`,

    `CREATE INDEX expertiseprofile_person IF NOT EXISTS
     FOR (ep:ExpertiseProfile) ON (ep.personId)`,

    // T018: WorkloadSnapshot indexes
    `CREATE INDEX workloadsnapshot_org IF NOT EXISTS
     FOR (ws:WorkloadSnapshot) ON (ws.organizationId)`,

    `CREATE INDEX workloadsnapshot_person IF NOT EXISTS
     FOR (ws:WorkloadSnapshot) ON (ws.personId)`,

    `CREATE INDEX workloadsnapshot_timestamp IF NOT EXISTS
     FOR (ws:WorkloadSnapshot) ON (ws.timestamp)`,

    // Skill indexes
    `CREATE INDEX skill_name IF NOT EXISTS
     FOR (s:Skill) ON (s.name)`,

    `CREATE INDEX skill_category IF NOT EXISTS
     FOR (s:Skill) ON (s.category)`,

    // Domain indexes
    `CREATE INDEX domain_name IF NOT EXISTS
     FOR (d:Domain) ON (d.name)`,

    // T019: HAS_EXPERTISE relationship - indexed via node indexes
    // T020: Enhanced Person properties for routing
    `CREATE INDEX person_availability IF NOT EXISTS
     FOR (p:Person) ON (p.currentWorkload)`,

    `CREATE INDEX person_skills IF NOT EXISTS
     FOR (p:Person) ON (p.primarySkills)`,
  ];

  for (const index of indexes) {
    try {
      await session.run(index);
    } catch (error) {
      // Index may already exist, which is fine
      if (!(error instanceof Error) || !error.message.includes('already exists')) {
        throw error;
      }
    }
  }
}

/**
 * Create a Neo4j driver instance
 */
export function createNeo4jDriver(config: Neo4jConfig): Driver {
  return neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.user, config.password),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 30000,
      maxTransactionRetryTime: 30000,
    }
  );
}

/**
 * Verify Neo4j connection
 */
export async function verifyNeo4jConnection(driver: Driver): Promise<boolean> {
  const session = driver.session();
  try {
    const result = await session.run('RETURN 1 AS test');
    return result.records[0].get('test').toNumber() === 1;
  } catch (error) {
    console.error('Neo4j connection verification failed:', error);
    return false;
  } finally {
    await session.close();
  }
}

/**
 * Clear all data from the database (use with caution!)
 */
export async function clearNeo4jData(
  driver: Driver,
  organizationId?: string
): Promise<void> {
  const session = driver.session();
  try {
    if (organizationId) {
      // Clear only data for specific organization
      await session.run(
        `MATCH (n {organizationId: $organizationId})
         DETACH DELETE n`,
        { organizationId }
      );
    } else {
      // Clear all data
      await session.run('MATCH (n) DETACH DELETE n');
    }
  } finally {
    await session.close();
  }
}
