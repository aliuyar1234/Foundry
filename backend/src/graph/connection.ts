/**
 * Neo4j Connection Manager
 * Handles connection pooling and session management for Neo4j
 */

import neo4j, { Driver, Session, Transaction } from 'neo4j-driver';

let driver: Driver | null = null;

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Initialize Neo4j driver
 * SECURITY: Fails fast if credentials are not configured - no default passwords
 */
export function initializeNeo4j(config?: Neo4jConfig): Driver {
  if (driver) {
    return driver;
  }

  const uri = config?.uri || process.env.NEO4J_URI;
  const username = config?.username || process.env.NEO4J_USERNAME;
  const password = config?.password || process.env.NEO4J_PASSWORD;

  // SECURITY: Fail fast if credentials are missing - never use defaults
  if (!uri) {
    throw new Error('NEO4J_URI environment variable is required');
  }
  if (!username) {
    throw new Error('NEO4J_USERNAME environment variable is required');
  }
  if (!password) {
    throw new Error('NEO4J_PASSWORD environment variable is required');
  }

  // SECURITY: Warn if using weak password patterns (but don't block - might be intentional in dev)
  if (password === 'password' || password === 'neo4j' || password.length < 8) {
    console.warn('WARNING: Neo4j password appears weak. Use a strong password in production.');
  }

  driver = neo4j.driver(
    uri,
    neo4j.auth.basic(username, password),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 30000,
      connectionTimeout: 5000,
    }
  );

  return driver;
}

/**
 * Get Neo4j driver instance
 */
export function getDriver(): Driver {
  if (!driver) {
    return initializeNeo4j();
  }
  return driver;
}

/**
 * Get a session from the driver
 */
export function getSession(database?: string): Session {
  const db = database || process.env.NEO4J_DATABASE || 'neo4j';
  return getDriver().session({ database: db });
}

/**
 * Close the Neo4j driver
 */
export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Test Neo4j connection
 */
export async function testConnection(): Promise<boolean> {
  const session = getSession();
  try {
    await session.run('RETURN 1 as test');
    return true;
  } catch (error) {
    console.error('Neo4j connection test failed:', error);
    return false;
  } finally {
    await session.close();
  }
}

/**
 * Run a query within a session
 */
export async function runQuery<T>(
  query: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = getSession();
  try {
    const result = await session.run(query, params);
    return result.records.map(record => record.toObject() as T);
  } finally {
    await session.close();
  }
}

/**
 * Run a write transaction
 */
export async function runWriteTransaction<T>(
  work: (tx: Transaction) => Promise<T>
): Promise<T> {
  const session = getSession();
  try {
    return await session.executeWrite(work);
  } finally {
    await session.close();
  }
}

/**
 * Run a read transaction
 */
export async function runReadTransaction<T>(
  work: (tx: Transaction) => Promise<T>
): Promise<T> {
  const session = getSession();
  try {
    return await session.executeRead(work);
  } finally {
    await session.close();
  }
}

/**
 * Create indexes for the knowledge graph
 */
export async function createIndexes(): Promise<void> {
  const session = getSession();
  try {
    // Person indexes
    await session.run(`
      CREATE INDEX person_email IF NOT EXISTS
      FOR (p:Person) ON (p.email)
    `);

    await session.run(`
      CREATE INDEX person_org IF NOT EXISTS
      FOR (p:Person) ON (p.organizationId)
    `);

    // Process indexes
    await session.run(`
      CREATE INDEX process_org IF NOT EXISTS
      FOR (p:Process) ON (p.organizationId)
    `);

    await session.run(`
      CREATE INDEX process_name IF NOT EXISTS
      FOR (p:Process) ON (p.name)
    `);

    // ProcessStep indexes
    await session.run(`
      CREATE INDEX step_process IF NOT EXISTS
      FOR (s:ProcessStep) ON (s.processId)
    `);

    // Activity indexes
    await session.run(`
      CREATE INDEX activity_org IF NOT EXISTS
      FOR (a:Activity) ON (a.organizationId)
    `);

    console.log('Neo4j indexes created successfully');
  } finally {
    await session.close();
  }
}

/**
 * Create constraints for the knowledge graph
 */
export async function createConstraints(): Promise<void> {
  const session = getSession();
  try {
    // Unique constraint for Person email within organization
    await session.run(`
      CREATE CONSTRAINT person_unique IF NOT EXISTS
      FOR (p:Person) REQUIRE (p.organizationId, p.email) IS UNIQUE
    `);

    // Unique constraint for Process name within organization
    await session.run(`
      CREATE CONSTRAINT process_unique IF NOT EXISTS
      FOR (p:Process) REQUIRE (p.organizationId, p.name) IS UNIQUE
    `);

    console.log('Neo4j constraints created successfully');
  } catch (error) {
    // Constraints might fail on community edition
    console.warn('Could not create all constraints:', error);
  } finally {
    await session.close();
  }
}

/**
 * Initialize schema (indexes and constraints)
 */
export async function initializeSchema(): Promise<void> {
  await createIndexes();
  await createConstraints();
}
