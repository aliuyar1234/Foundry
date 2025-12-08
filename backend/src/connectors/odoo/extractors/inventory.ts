/**
 * Odoo Inventory Module Extractor
 * Task: T046
 *
 * Extracts stock moves, pickings, quants, and warehouse data.
 * Tracks inventory movements and stock levels.
 */

import { ExtractedEvent } from '../../base/connector';
import { OdooXmlRpcClient } from '../xmlrpcClient';
import { OdooRestClient } from '../restClient';

type OdooClient = OdooXmlRpcClient | OdooRestClient;

export interface InventoryExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  warehouseIds?: number[];
  limit?: number;
}

export interface StockPicking {
  id: number;
  name: string;
  partner_id?: [number, string];
  picking_type_id: [number, string];
  location_id: [number, string];
  location_dest_id: [number, string];
  state: 'draft' | 'waiting' | 'confirmed' | 'assigned' | 'done' | 'cancel';
  scheduled_date?: string;
  date_done?: string;
  origin?: string;
  move_ids_without_package: number[];
  company_id: [number, string];
  create_date: string;
  write_date: string;
}

export interface StockMove {
  id: number;
  name: string;
  product_id: [number, string];
  product_uom_qty: number;
  quantity_done: number;
  product_uom: [number, string];
  picking_id?: [number, string];
  location_id: [number, string];
  location_dest_id: [number, string];
  state: 'draft' | 'waiting' | 'confirmed' | 'assigned' | 'done' | 'cancel';
  date?: string;
  reference?: string;
  origin?: string;
  create_date: string;
  write_date: string;
}

export interface StockQuant {
  id: number;
  product_id: [number, string];
  location_id: [number, string];
  lot_id?: [number, string];
  package_id?: [number, string];
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  create_date: string;
  write_date: string;
}

export interface StockWarehouse {
  id: number;
  name: string;
  code: string;
  company_id: [number, string];
  lot_stock_id: [number, string];
  view_location_id: [number, string];
  reception_steps: string;
  delivery_steps: string;
  active: boolean;
  create_date: string;
  write_date: string;
}

export interface StockLocation {
  id: number;
  name: string;
  complete_name: string;
  location_id?: [number, string];
  usage: 'supplier' | 'view' | 'internal' | 'customer' | 'inventory' | 'production' | 'transit';
  company_id?: [number, string];
  active: boolean;
  create_date: string;
  write_date: string;
}

const PICKING_FIELDS = [
  'id', 'name', 'partner_id', 'picking_type_id', 'location_id', 'location_dest_id',
  'state', 'scheduled_date', 'date_done', 'origin', 'move_ids_without_package',
  'company_id', 'create_date', 'write_date',
];

const MOVE_FIELDS = [
  'id', 'name', 'product_id', 'product_uom_qty', 'quantity_done', 'product_uom',
  'picking_id', 'location_id', 'location_dest_id', 'state', 'date',
  'reference', 'origin', 'create_date', 'write_date',
];

const QUANT_FIELDS = [
  'id', 'product_id', 'location_id', 'lot_id', 'package_id',
  'quantity', 'reserved_quantity', 'available_quantity',
  'create_date', 'write_date',
];

const WAREHOUSE_FIELDS = [
  'id', 'name', 'code', 'company_id', 'lot_stock_id', 'view_location_id',
  'reception_steps', 'delivery_steps', 'active', 'create_date', 'write_date',
];

const LOCATION_FIELDS = [
  'id', 'name', 'complete_name', 'location_id', 'usage',
  'company_id', 'active', 'create_date', 'write_date',
];

export class OdooInventoryExtractor {
  private client: OdooClient;

  constructor(client: OdooClient) {
    this.client = client;
  }

  /**
   * Extract stock pickings (transfers)
   */
  async extractPickings(options: InventoryExtractionOptions): Promise<{
    events: ExtractedEvent[];
    pickings: StockPicking[];
  }> {
    const events: ExtractedEvent[] = [];
    const pickings: StockPicking[] = [];

    const domain: Array<[string, string, unknown]> = [];

    if (options.modifiedAfter) {
      domain.push([
        'write_date',
        '>=',
        options.modifiedAfter.toISOString().split('T')[0],
      ]);
    }

    const batchSize = options.limit || 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.client.searchRead<StockPicking>(
        'stock.picking',
        domain,
        {
          fields: PICKING_FIELDS,
          limit: batchSize,
          offset,
          order: 'write_date desc',
        }
      );

      for (const picking of batch) {
        pickings.push(picking);
        events.push(this.pickingToEvent(picking, options.organizationId));
      }

      hasMore = batch.length === batchSize;
      offset += batchSize;
    }

    return { events, pickings };
  }

  /**
   * Extract stock moves
   */
  async extractMoves(options: InventoryExtractionOptions): Promise<{
    events: ExtractedEvent[];
    moves: StockMove[];
  }> {
    const events: ExtractedEvent[] = [];
    const moves: StockMove[] = [];

    const domain: Array<[string, string, unknown]> = [];

    if (options.modifiedAfter) {
      domain.push([
        'write_date',
        '>=',
        options.modifiedAfter.toISOString().split('T')[0],
      ]);
    }

    const batchSize = options.limit || 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.client.searchRead<StockMove>('stock.move', domain, {
        fields: MOVE_FIELDS,
        limit: batchSize,
        offset,
        order: 'write_date desc',
      });

      for (const move of batch) {
        moves.push(move);
        events.push(this.moveToEvent(move, options.organizationId));
      }

      hasMore = batch.length === batchSize;
      offset += batchSize;
    }

    return { events, moves };
  }

  /**
   * Extract current stock levels (quants)
   */
  async extractQuants(options: {
    organizationId: string;
    locationIds?: number[];
    productIds?: number[];
  }): Promise<{
    events: ExtractedEvent[];
    quants: StockQuant[];
  }> {
    const events: ExtractedEvent[] = [];

    const domain: Array<[string, string, unknown]> = [['quantity', '!=', 0]];

    if (options.locationIds?.length) {
      domain.push(['location_id', 'in', options.locationIds]);
    }

    if (options.productIds?.length) {
      domain.push(['product_id', 'in', options.productIds]);
    }

    const quants = await this.client.searchRead<StockQuant>('stock.quant', domain, {
      fields: QUANT_FIELDS,
      order: 'product_id asc',
    });

    for (const quant of quants) {
      events.push(this.quantToEvent(quant, options.organizationId));
    }

    return { events, quants };
  }

  /**
   * Extract warehouses
   */
  async extractWarehouses(options: InventoryExtractionOptions): Promise<{
    events: ExtractedEvent[];
    warehouses: StockWarehouse[];
  }> {
    const events: ExtractedEvent[] = [];

    const domain: Array<[string, string, unknown]> = [['active', '=', true]];

    if (options.warehouseIds?.length) {
      domain.push(['id', 'in', options.warehouseIds]);
    }

    const warehouses = await this.client.searchRead<StockWarehouse>(
      'stock.warehouse',
      domain,
      { fields: WAREHOUSE_FIELDS }
    );

    for (const warehouse of warehouses) {
      events.push(this.warehouseToEvent(warehouse, options.organizationId));
    }

    return { events, warehouses };
  }

  /**
   * Extract locations
   */
  async extractLocations(options: {
    organizationId: string;
    usage?: string[];
    warehouseId?: number;
  }): Promise<{
    events: ExtractedEvent[];
    locations: StockLocation[];
  }> {
    const events: ExtractedEvent[] = [];

    const domain: Array<[string, string, unknown]> = [['active', '=', true]];

    if (options.usage?.length) {
      domain.push(['usage', 'in', options.usage]);
    }

    const locations = await this.client.searchRead<StockLocation>(
      'stock.location',
      domain,
      { fields: LOCATION_FIELDS }
    );

    for (const location of locations) {
      events.push(this.locationToEvent(location, options.organizationId));
    }

    return { events, locations };
  }

  /**
   * Get product stock levels
   */
  async getProductStockLevels(
    productIds: number[],
    locationId?: number
  ): Promise<Map<number, { onHand: number; reserved: number; available: number }>> {
    const domain: Array<[string, string, unknown]> = [
      ['product_id', 'in', productIds],
    ];

    if (locationId) {
      domain.push(['location_id', '=', locationId]);
    }

    const quants = await this.client.searchRead<StockQuant>('stock.quant', domain, {
      fields: ['product_id', 'quantity', 'reserved_quantity', 'available_quantity'],
    });

    const stockLevels = new Map<number, { onHand: number; reserved: number; available: number }>();

    // Initialize all products with zero stock
    for (const productId of productIds) {
      stockLevels.set(productId, { onHand: 0, reserved: 0, available: 0 });
    }

    // Aggregate quants by product
    for (const quant of quants) {
      const productId = quant.product_id[0];
      const existing = stockLevels.get(productId)!;

      existing.onHand += quant.quantity;
      existing.reserved += quant.reserved_quantity;
      existing.available += quant.available_quantity;
    }

    return stockLevels;
  }

  /**
   * Get inventory statistics
   */
  async getInventoryStats(options: {
    warehouseId?: number;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<{
    totalWarehouses: number;
    totalLocations: number;
    totalProducts: number;
    totalStockValue: number;
    recentMovements: number;
    pendingTransfers: number;
  }> {
    // Count warehouses
    const totalWarehouses = await this.client.searchCount('stock.warehouse', [
      ['active', '=', true],
    ]);

    // Count internal locations
    const totalLocations = await this.client.searchCount('stock.location', [
      ['active', '=', true],
      ['usage', '=', 'internal'],
    ]);

    // Count products with stock
    const totalProducts = await this.client.searchCount('stock.quant', [
      ['quantity', '>', 0],
    ]);

    // Count recent movements
    const moveDomain: Array<[string, string, unknown]> = [['state', '=', 'done']];

    if (options.dateFrom) {
      moveDomain.push(['date', '>=', options.dateFrom.toISOString()]);
    }

    if (options.dateTo) {
      moveDomain.push(['date', '<=', options.dateTo.toISOString()]);
    }

    const recentMovements = await this.client.searchCount('stock.move', moveDomain);

    // Count pending transfers
    const pendingTransfers = await this.client.searchCount('stock.picking', [
      ['state', 'in', ['waiting', 'confirmed', 'assigned']],
    ]);

    return {
      totalWarehouses,
      totalLocations,
      totalProducts,
      totalStockValue: 0, // Would need product costs to calculate
      recentMovements,
      pendingTransfers,
    };
  }

  /**
   * Convert picking to event
   */
  private pickingToEvent(picking: StockPicking, organizationId: string): ExtractedEvent {
    const createdAt = new Date(picking.create_date);
    const updatedAt = new Date(picking.write_date);
    const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;

    let eventType: string;
    switch (picking.state) {
      case 'draft':
        eventType = isNew ? 'erp.transfer.created' : 'erp.transfer.updated';
        break;
      case 'waiting':
      case 'confirmed':
        eventType = 'erp.transfer.confirmed';
        break;
      case 'assigned':
        eventType = 'erp.transfer.ready';
        break;
      case 'done':
        eventType = 'erp.transfer.done';
        break;
      case 'cancel':
        eventType = 'erp.transfer.cancelled';
        break;
      default:
        eventType = 'erp.transfer.updated';
    }

    return {
      type: eventType,
      timestamp: updatedAt,
      actorId: undefined,
      targetId: String(picking.id),
      metadata: {
        source: 'odoo',
        organizationId,
        pickingId: picking.id,
        pickingName: picking.name,
        pickingTypeId: picking.picking_type_id[0],
        pickingTypeName: picking.picking_type_id[1],
        partnerId: picking.partner_id?.[0],
        partnerName: picking.partner_id?.[1],
        sourceLocationId: picking.location_id[0],
        sourceLocationName: picking.location_id[1],
        destLocationId: picking.location_dest_id[0],
        destLocationName: picking.location_dest_id[1],
        status: picking.state,
        scheduledDate: picking.scheduled_date,
        doneDate: picking.date_done,
        origin: picking.origin,
        moveCount: picking.move_ids_without_package?.length || 0,
        companyId: picking.company_id[0],
        createdAt: picking.create_date,
        updatedAt: picking.write_date,
      },
    };
  }

  /**
   * Convert move to event
   */
  private moveToEvent(move: StockMove, organizationId: string): ExtractedEvent {
    const createdAt = new Date(move.create_date);
    const updatedAt = new Date(move.write_date);
    const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;

    let eventType: string;
    if (move.state === 'done') {
      eventType = 'erp.stock.moved';
    } else if (move.state === 'cancel') {
      eventType = 'erp.stock.move_cancelled';
    } else {
      eventType = isNew ? 'erp.stock.move_created' : 'erp.stock.move_updated';
    }

    return {
      type: eventType,
      timestamp: updatedAt,
      actorId: undefined,
      targetId: String(move.id),
      metadata: {
        source: 'odoo',
        organizationId,
        moveId: move.id,
        moveName: move.name,
        productId: move.product_id[0],
        productName: move.product_id[1],
        quantity: move.product_uom_qty,
        quantityDone: move.quantity_done,
        unitOfMeasure: move.product_uom[1],
        pickingId: move.picking_id?.[0],
        pickingName: move.picking_id?.[1],
        sourceLocationId: move.location_id[0],
        sourceLocationName: move.location_id[1],
        destLocationId: move.location_dest_id[0],
        destLocationName: move.location_dest_id[1],
        status: move.state,
        date: move.date,
        reference: move.reference,
        origin: move.origin,
        createdAt: move.create_date,
        updatedAt: move.write_date,
      },
    };
  }

  /**
   * Convert quant to event
   */
  private quantToEvent(quant: StockQuant, organizationId: string): ExtractedEvent {
    return {
      type: 'erp.stock.level',
      timestamp: new Date(quant.write_date),
      actorId: undefined,
      targetId: String(quant.id),
      metadata: {
        source: 'odoo',
        organizationId,
        quantId: quant.id,
        productId: quant.product_id[0],
        productName: quant.product_id[1],
        locationId: quant.location_id[0],
        locationName: quant.location_id[1],
        lotId: quant.lot_id?.[0],
        lotName: quant.lot_id?.[1],
        packageId: quant.package_id?.[0],
        packageName: quant.package_id?.[1],
        quantityOnHand: quant.quantity,
        quantityReserved: quant.reserved_quantity,
        quantityAvailable: quant.available_quantity,
        createdAt: quant.create_date,
        updatedAt: quant.write_date,
      },
    };
  }

  /**
   * Convert warehouse to event
   */
  private warehouseToEvent(
    warehouse: StockWarehouse,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'erp.warehouse',
      timestamp: new Date(warehouse.write_date),
      actorId: undefined,
      targetId: String(warehouse.id),
      metadata: {
        source: 'odoo',
        organizationId,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        warehouseCode: warehouse.code,
        companyId: warehouse.company_id[0],
        companyName: warehouse.company_id[1],
        stockLocationId: warehouse.lot_stock_id[0],
        receptionSteps: warehouse.reception_steps,
        deliverySteps: warehouse.delivery_steps,
        active: warehouse.active,
        createdAt: warehouse.create_date,
        updatedAt: warehouse.write_date,
      },
    };
  }

  /**
   * Convert location to event
   */
  private locationToEvent(
    location: StockLocation,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'erp.location',
      timestamp: new Date(location.write_date),
      actorId: undefined,
      targetId: String(location.id),
      metadata: {
        source: 'odoo',
        organizationId,
        locationId: location.id,
        locationName: location.name,
        locationFullName: location.complete_name,
        parentLocationId: location.location_id?.[0],
        parentLocationName: location.location_id?.[1],
        usage: location.usage,
        companyId: location.company_id?.[0],
        active: location.active,
        createdAt: location.create_date,
        updatedAt: location.write_date,
      },
    };
  }
}

/**
 * Create inventory extractor
 */
export function createOdooInventoryExtractor(
  client: OdooClient
): OdooInventoryExtractor {
  return new OdooInventoryExtractor(client);
}
