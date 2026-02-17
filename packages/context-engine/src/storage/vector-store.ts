import type { ContextVector, VectorSearchResult, VectorSource } from './types'

import * as lancedb from '@lancedb/lancedb'

/**
 * LanceDB vector storage wrapper.
 * Provides insert, search, and delete operations for embedding vectors.
 */
export class VectorStore {
  private db: lancedb.Connection | null

  private constructor(db: lancedb.Connection) {
    this.db = db
  }

  /**
   * Create a VectorStore connected to the given directory.
   * LanceDB stores data as Lance files in this directory.
   */
  static async create(dataDir: string): Promise<VectorStore> {
    const db = await lancedb.connect(dataDir)
    return new VectorStore(db)
  }

  private getDb(): lancedb.Connection {
    if (!this.db) {
      throw new Error('VectorStore is closed')
    }
    return this.db
  }

  /**
   * Create a new table for vectors of the given dimension.
   * If the table already exists, this is a no-op.
   */
  async createTable(name: string, dimension: number): Promise<void> {
    if (!Number.isInteger(dimension) || dimension < 1) {
      throw new Error(`Invalid vector dimension: ${dimension}`)
    }
    const db = this.getDb()
    const existing = await db.tableNames()
    if (existing.includes(name)) {
      return
    }
    // Create with a dummy row then delete it — LanceDB requires data to infer schema
    const dummyVector = Array.from({ length: dimension }, () => 0)
    const table = await db.createTable(name, [
      {
        id: '__init__',
        vector: dummyVector,
        source: '',
        content: '',
        createdAt: 0,
      },
    ])
    await table.delete(`id = '__init__'`)
  }

  /**
   * Insert one or more vectors into the named table.
   */
  async insert(tableName: string, vectors: ContextVector[]): Promise<void> {
    const table = await this.getDb().openTable(tableName)
    const records = vectors.map(v => ({ ...v }))
    await table.add(records)
  }

  /**
   * Search for the nearest vectors to the query vector.
   * Returns up to `topK` results ordered by distance (ascending).
   */
  async search(tableName: string, queryVector: number[], topK: number): Promise<VectorSearchResult[]> {
    const table = await this.getDb().openTable(tableName)
    const rowCount = await table.countRows()
    if (rowCount === 0) {
      return []
    }

    const results = await table
      .search(queryVector)
      .limit(topK)
      .toArray()

    return results.map(row => ({
      id: row.id as string,
      source: row.source as VectorSource,
      content: row.content as string,
      createdAt: row.createdAt as number,
      _distance: row._distance as number,
    }))
  }

  /**
   * Delete a single vector by its id.
   */
  async deleteById(tableName: string, id: string): Promise<void> {
    const table = await this.getDb().openTable(tableName)
    await table.delete(`id = '${id.replaceAll('\'', '\'\'')}'`)
  }

  /**
   * Delete vectors matching the LanceDB filter expression.
   * Use deleteById() for the common single-record case.
   */
  async delete(tableName: string, filter: string): Promise<void> {
    const table = await this.getDb().openTable(tableName)
    await table.delete(filter)
  }

  /**
   * Count the number of rows in the named table.
   */
  async count(tableName: string): Promise<number> {
    const table = await this.getDb().openTable(tableName)
    return table.countRows()
  }

  /**
   * Close the database connection.
   * Subsequent operations will throw.
   */
  async close(): Promise<void> {
    this.db = null
  }
}
