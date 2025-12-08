/**
 * Salesforce Bulk API 2.0 Support
 * Task: T085
 *
 * Handles large data extractions using Salesforce Bulk API 2.0.
 * Supports async query jobs for high-volume data retrieval.
 */

import { SalesforceClient } from './salesforceClient';

export interface BulkQueryJob {
  id: string;
  operation: 'query' | 'queryAll';
  object: string;
  state: 'UploadComplete' | 'InProgress' | 'Aborted' | 'JobComplete' | 'Failed';
  contentType: 'CSV';
  lineEnding: 'LF' | 'CRLF';
  columnDelimiter: 'COMMA' | 'TAB' | 'PIPE' | 'SEMICOLON' | 'CARET' | 'BACKQUOTE';
  numberRecordsProcessed: number;
  retries: number;
  totalProcessingTime: number;
  createdDate: string;
  createdById: string;
  systemModstamp: string;
}

export interface BulkQueryResult<T> {
  records: T[];
  totalRecords: number;
  failedRecords: number;
  processingTime: number;
}

export interface BulkJobOptions {
  operation?: 'query' | 'queryAll';
  columnDelimiter?: BulkQueryJob['columnDelimiter'];
  lineEnding?: BulkQueryJob['lineEnding'];
  pollInterval?: number;
  maxPollAttempts?: number;
}

export class SalesforceBulkApi {
  private client: SalesforceClient;
  private instanceUrl: string;
  private accessToken: string;
  private apiVersion = 'v59.0';

  constructor(client: SalesforceClient, instanceUrl: string, accessToken: string) {
    this.client = client;
    this.instanceUrl = instanceUrl;
    this.accessToken = accessToken;
  }

  /**
   * Create a bulk query job
   */
  async createQueryJob(
    soql: string,
    options: BulkJobOptions = {}
  ): Promise<BulkQueryJob> {
    const url = `${this.instanceUrl}/services/data/${this.apiVersion}/jobs/query`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: options.operation || 'query',
        query: soql,
        contentType: 'CSV',
        columnDelimiter: options.columnDelimiter || 'COMMA',
        lineEnding: options.lineEnding || 'LF',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create bulk query job: ${error[0]?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<BulkQueryJob> {
    const url = `${this.instanceUrl}/services/data/${this.apiVersion}/jobs/query/${jobId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get query results
   */
  async getQueryResults(
    jobId: string,
    locator?: string,
    maxRecords?: number
  ): Promise<{
    data: string;
    locator?: string;
    numberOfRecords: number;
  }> {
    let url = `${this.instanceUrl}/services/data/${this.apiVersion}/jobs/query/${jobId}/results`;

    const params = new URLSearchParams();
    if (locator) params.set('locator', locator);
    if (maxRecords) params.set('maxRecords', String(maxRecords));

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'text/csv',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get query results: ${response.statusText}`);
    }

    const data = await response.text();
    const sfLocator = response.headers.get('Sforce-Locator');
    const numberOfRecords = parseInt(response.headers.get('Sforce-NumberOfRecords') || '0', 10);

    return {
      data,
      locator: sfLocator && sfLocator !== 'null' ? sfLocator : undefined,
      numberOfRecords,
    };
  }

  /**
   * Abort a job
   */
  async abortJob(jobId: string): Promise<BulkQueryJob> {
    const url = `${this.instanceUrl}/services/data/${this.apiVersion}/jobs/query/${jobId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state: 'Aborted' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to abort job: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a job
   */
  async deleteJob(jobId: string): Promise<void> {
    const url = `${this.instanceUrl}/services/data/${this.apiVersion}/jobs/query/${jobId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete job: ${response.statusText}`);
    }
  }

  /**
   * Execute a bulk query and wait for results
   */
  async executeQuery<T extends Record<string, unknown>>(
    soql: string,
    options: BulkJobOptions = {}
  ): Promise<BulkQueryResult<T>> {
    const pollInterval = options.pollInterval || 2000;
    const maxPollAttempts = options.maxPollAttempts || 300; // 10 minutes max

    // Create job
    const job = await this.createQueryJob(soql, options);

    // Poll for completion
    let attempts = 0;
    let jobStatus = job;

    while (
      jobStatus.state !== 'JobComplete' &&
      jobStatus.state !== 'Aborted' &&
      jobStatus.state !== 'Failed'
    ) {
      if (attempts >= maxPollAttempts) {
        await this.abortJob(job.id);
        throw new Error('Bulk query job timed out');
      }

      await this.sleep(pollInterval);
      jobStatus = await this.getJobStatus(job.id);
      attempts++;
    }

    if (jobStatus.state === 'Aborted') {
      throw new Error('Bulk query job was aborted');
    }

    if (jobStatus.state === 'Failed') {
      throw new Error('Bulk query job failed');
    }

    // Get all results
    const records: T[] = [];
    let locator: string | undefined;
    let totalRecords = 0;

    do {
      const result = await this.getQueryResults(job.id, locator, 10000);
      const parsedRecords = this.parseCSV<T>(result.data);
      records.push(...parsedRecords);
      totalRecords += result.numberOfRecords;
      locator = result.locator;
    } while (locator);

    // Clean up
    try {
      await this.deleteJob(job.id);
    } catch {
      // Ignore cleanup errors
    }

    return {
      records,
      totalRecords,
      failedRecords: 0,
      processingTime: jobStatus.totalProcessingTime,
    };
  }

  /**
   * Parse CSV data into objects
   */
  private parseCSV<T extends Record<string, unknown>>(csv: string): T[] {
    const lines = csv.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const records: T[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const record: Record<string, unknown> = {};

      for (let j = 0; j < headers.length; j++) {
        const value = values[j];
        // Try to parse JSON values (for nested objects)
        if (value && (value.startsWith('{') || value.startsWith('['))) {
          try {
            record[headers[j]] = JSON.parse(value);
          } catch {
            record[headers[j]] = value;
          }
        } else if (value === '' || value === undefined) {
          record[headers[j]] = null;
        } else if (value === 'true') {
          record[headers[j]] = true;
        } else if (value === 'false') {
          record[headers[j]] = false;
        } else if (!isNaN(Number(value)) && value.trim() !== '') {
          record[headers[j]] = Number(value);
        } else {
          record[headers[j]] = value;
        }
      }

      records.push(record as T);
    }

    return records;
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * List all query jobs
   */
  async listJobs(options?: {
    isPkChunkingEnabled?: boolean;
    jobType?: 'BigObjectIngest' | 'Classic' | 'V2Query';
  }): Promise<{
    done: boolean;
    records: BulkQueryJob[];
    nextRecordsUrl?: string;
  }> {
    let url = `${this.instanceUrl}/services/data/${this.apiVersion}/jobs/query`;

    const params = new URLSearchParams();
    if (options?.isPkChunkingEnabled !== undefined) {
      params.set('isPkChunkingEnabled', String(options.isPkChunkingEnabled));
    }
    if (options?.jobType) {
      params.set('jobType', options.jobType);
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Create Bulk API client
 */
export function createBulkApi(
  client: SalesforceClient,
  instanceUrl: string,
  accessToken: string
): SalesforceBulkApi {
  return new SalesforceBulkApi(client, instanceUrl, accessToken);
}
