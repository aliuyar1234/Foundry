/**
 * SAP B1 Items/Products Extractor
 * Task: T062
 *
 * Extracts items, item groups, price lists, and inventory data.
 * Handles batch/serial managed items and warehouse stock.
 */

import { ExtractedEvent } from '../../base/connector';
import { SapB1Client, SapItem } from '../sapClient';

export interface ItemExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  limit?: number;
  includeInactive?: boolean;
  includeStock?: boolean;
  itemGroups?: number[];
}

export interface ExtractedItem {
  itemCode: string;
  itemName: string;
  itemType: 'itItems' | 'itLabor' | 'itTravel' | 'itFixedAssets';
  itemGroup: number;
  itemGroupName?: string;
  barCode?: string;
  manufacturer?: string;
  inventoryItem: boolean;
  salesItem: boolean;
  purchaseItem: boolean;
  active: boolean;
  manageBatchNumbers: boolean;
  manageSerialNumbers: boolean;
  defaultWarehouse?: string;
  purchaseUnit?: string;
  salesUnit?: string;
  inventoryUnit?: string;
  prices: ItemPrice[];
  stock?: ItemStock[];
  createDate: Date;
  updateDate: Date;
}

export interface ItemPrice {
  priceList: number;
  priceListName?: string;
  price: number;
  currency: string;
  basePrice?: number;
}

export interface ItemStock {
  warehouseCode: string;
  warehouseName?: string;
  inStock: number;
  committed: number;
  ordered: number;
  available: number;
}

export interface ItemGroup {
  number: number;
  name: string;
  locked: boolean;
  itemCount?: number;
}

export class SapItemsExtractor {
  private client: SapB1Client;
  private itemGroupCache: Map<number, string> = new Map();
  private priceListCache: Map<number, string> = new Map();

  constructor(client: SapB1Client) {
    this.client = client;
  }

  /**
   * Extract items/products
   */
  async extractItems(
    options: ItemExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    items: ExtractedItem[];
  }> {
    const events: ExtractedEvent[] = [];
    const items: ExtractedItem[] = [];

    // Build filters
    const filters: string[] = [];

    if (options.modifiedAfter) {
      filters.push(`UpdateDate ge '${options.modifiedAfter.toISOString().split('T')[0]}'`);
    }

    if (!options.includeInactive) {
      filters.push("Valid eq 'tYES'");
    }

    if (options.itemGroups?.length) {
      const groupFilter = options.itemGroups.map((g) => `ItemsGroupCode eq ${g}`).join(' or ');
      filters.push(`(${groupFilter})`);
    }

    // Preload caches
    await this.loadCaches();

    // Fetch items
    const sapItems = await this.client.getAll<SapItem>('Items', {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 500,
      $expand: 'ItemPrices',
    });

    for (const item of sapItems) {
      const extracted = await this.mapItem(item, options.includeStock);
      items.push(extracted);

      // Create event
      events.push(this.itemToEvent(item, extracted, options.organizationId));
    }

    return { events, items };
  }

  /**
   * Extract item groups
   */
  async extractItemGroups(
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    groups: ItemGroup[];
  }> {
    const events: ExtractedEvent[] = [];
    const groups: ItemGroup[] = [];

    try {
      const response = await this.client.query<any>('ItemGroups', {
        $orderby: 'Number asc',
      });

      for (const grp of response.value) {
        const group: ItemGroup = {
          number: grp.Number,
          name: grp.GroupName,
          locked: grp.Locked === 'tYES',
        };

        groups.push(group);

        events.push({
          type: 'erp.item_group',
          timestamp: new Date(),
          actorId: undefined,
          targetId: String(group.number),
          metadata: {
            source: 'sap_b1',
            organizationId: options.organizationId,
            groupNumber: group.number,
            groupName: group.name,
            locked: group.locked,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to extract item groups:', error);
    }

    return { events, groups };
  }

  /**
   * Extract price lists
   */
  async extractPriceLists(
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    priceLists: Array<{
      number: number;
      name: string;
      basePriceList?: number;
      factor: number;
      active: boolean;
    }>;
  }> {
    const events: ExtractedEvent[] = [];
    const priceLists: Array<{
      number: number;
      name: string;
      basePriceList?: number;
      factor: number;
      active: boolean;
    }> = [];

    try {
      const response = await this.client.query<any>('PriceLists', {
        $orderby: 'PriceListNo asc',
      });

      for (const pl of response.value) {
        const priceList = {
          number: pl.PriceListNo,
          name: pl.PriceListName,
          basePriceList: pl.BasePriceList,
          factor: pl.Factor || 1,
          active: pl.Active === 'tYES',
        };

        priceLists.push(priceList);

        events.push({
          type: 'erp.price_list',
          timestamp: new Date(),
          actorId: undefined,
          targetId: String(priceList.number),
          metadata: {
            source: 'sap_b1',
            organizationId: options.organizationId,
            priceListNumber: priceList.number,
            priceListName: priceList.name,
            basePriceList: priceList.basePriceList,
            factor: priceList.factor,
            active: priceList.active,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to extract price lists:', error);
    }

    return { events, priceLists };
  }

  /**
   * Extract warehouse stock for items
   */
  async extractItemStock(
    itemCodes: string[],
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    stock: Map<string, ItemStock[]>;
  }> {
    const events: ExtractedEvent[] = [];
    const stock = new Map<string, ItemStock[]>();

    for (const itemCode of itemCodes) {
      try {
        const response = await this.client.query<any>('ItemWarehouseInfoCollection', {
          $filter: `ItemCode eq '${itemCode}'`,
        });

        const itemStock: ItemStock[] = [];

        for (const wh of response.value) {
          const warehouseStock: ItemStock = {
            warehouseCode: wh.WarehouseCode,
            warehouseName: wh.WarehouseName,
            inStock: wh.InStock || 0,
            committed: wh.Committed || 0,
            ordered: wh.Ordered || 0,
            available: (wh.InStock || 0) - (wh.Committed || 0),
          };

          itemStock.push(warehouseStock);

          events.push({
            type: 'erp.item_stock',
            timestamp: new Date(),
            actorId: undefined,
            targetId: `${itemCode}:${wh.WarehouseCode}`,
            metadata: {
              source: 'sap_b1',
              organizationId: options.organizationId,
              itemCode,
              warehouseCode: wh.WarehouseCode,
              inStock: warehouseStock.inStock,
              committed: warehouseStock.committed,
              ordered: warehouseStock.ordered,
              available: warehouseStock.available,
            },
          });
        }

        stock.set(itemCode, itemStock);
      } catch (error) {
        console.warn(`Failed to extract stock for item ${itemCode}:`, error);
      }
    }

    return { events, stock };
  }

  /**
   * Map SAP item to extracted format
   */
  private async mapItem(item: SapItem, includeStock?: boolean): Promise<ExtractedItem> {
    const prices: ItemPrice[] = [];

    if (item.ItemPrices) {
      for (const price of item.ItemPrices) {
        prices.push({
          priceList: price.PriceList,
          priceListName: this.priceListCache.get(price.PriceList),
          price: price.Price,
          currency: price.Currency,
          basePrice: price.BasePrice,
        });
      }
    }

    const extracted: ExtractedItem = {
      itemCode: item.ItemCode,
      itemName: item.ItemName,
      itemType: item.ItemType as ExtractedItem['itemType'],
      itemGroup: item.ItemsGroupCode,
      itemGroupName: this.itemGroupCache.get(item.ItemsGroupCode),
      barCode: item.BarCode,
      manufacturer: item.Manufacturer,
      inventoryItem: item.InventoryItem === 'tYES',
      salesItem: item.SalesItem === 'tYES',
      purchaseItem: item.PurchaseItem === 'tYES',
      active: item.Valid === 'tYES',
      manageBatchNumbers: item.ManageBatchNumbers === 'tYES',
      manageSerialNumbers: item.ManageSerialNumbers === 'tYES',
      defaultWarehouse: item.DefaultWarehouse,
      purchaseUnit: item.PurchaseUnit,
      salesUnit: item.SalesUnit,
      inventoryUnit: item.InventoryUoMEntry?.toString(),
      prices,
      createDate: new Date(item.CreateDate),
      updateDate: new Date(item.UpdateDate),
    };

    return extracted;
  }

  /**
   * Convert item to event
   */
  private itemToEvent(
    item: SapItem,
    extracted: ExtractedItem,
    organizationId: string
  ): ExtractedEvent {
    const createDate = new Date(item.CreateDate);
    const updateDate = new Date(item.UpdateDate);
    const isNew = Math.abs(updateDate.getTime() - createDate.getTime()) < 60000;

    return {
      type: isNew ? 'erp.item.created' : 'erp.item.updated',
      timestamp: updateDate,
      actorId: undefined,
      targetId: item.ItemCode,
      metadata: {
        source: 'sap_b1',
        organizationId,
        itemCode: item.ItemCode,
        itemName: item.ItemName,
        itemType: item.ItemType,
        itemGroup: item.ItemsGroupCode,
        itemGroupName: extracted.itemGroupName,
        barCode: item.BarCode,
        manufacturer: item.Manufacturer,
        inventoryItem: extracted.inventoryItem,
        salesItem: extracted.salesItem,
        purchaseItem: extracted.purchaseItem,
        active: extracted.active,
        manageBatchNumbers: extracted.manageBatchNumbers,
        manageSerialNumbers: extracted.manageSerialNumbers,
        defaultWarehouse: item.DefaultWarehouse,
        priceCount: extracted.prices.length,
        createdAt: item.CreateDate,
        updatedAt: item.UpdateDate,
      },
    };
  }

  /**
   * Load lookup caches
   */
  private async loadCaches(): Promise<void> {
    // Load item groups
    if (this.itemGroupCache.size === 0) {
      try {
        const response = await this.client.query<any>('ItemGroups', {
          $select: 'Number,GroupName',
        });
        for (const grp of response.value) {
          this.itemGroupCache.set(grp.Number, grp.GroupName);
        }
      } catch {
        // Ignore cache loading errors
      }
    }

    // Load price lists
    if (this.priceListCache.size === 0) {
      try {
        const response = await this.client.query<any>('PriceLists', {
          $select: 'PriceListNo,PriceListName',
        });
        for (const pl of response.value) {
          this.priceListCache.set(pl.PriceListNo, pl.PriceListName);
        }
      } catch {
        // Ignore cache loading errors
      }
    }
  }

  /**
   * Search items by code or name
   */
  async searchItems(
    query: string,
    options: { organizationId: string; limit?: number }
  ): Promise<ExtractedItem[]> {
    await this.loadCaches();

    const response = await this.client.query<SapItem>('Items', {
      $filter: `contains(ItemCode, '${query}') or contains(ItemName, '${query}')`,
      $top: options.limit || 20,
    });

    const items: ExtractedItem[] = [];
    for (const item of response.value) {
      items.push(await this.mapItem(item, false));
    }

    return items;
  }
}

/**
 * Create items extractor
 */
export function createSapItemsExtractor(client: SapB1Client): SapItemsExtractor {
  return new SapItemsExtractor(client);
}
