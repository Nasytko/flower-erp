# Future extension: FlowerItemDetails

Item remains a single entity (`FLOWER` | `MATERIAL`). Optional flower-specific attributes (color, stem length, variety) may later live in a satellite `FlowerItemDetails` table keyed by `itemId`, without splitting inventory ledgers.

Not implemented in the current Master Data / Supply slice.
