# Domain Flow: Sales

**Status:** Accepted  
**Module:** `sales`  
**ADRs:** 016, 017, 018

## Responsibility

Record commercial realization (ORDER_BASED or DIRECT), discounts, and inventory consumption results. Not Payment, not Fiscal, not Order fulfillment.

## Entities

| Entity | Role |
|--------|------|
| Sale | Header amounts, type, status, channel, order link |
| SaleLine | Commercial lines (customer-facing) |
| SaleDiscount | Discount snapshot |
| SaleInventoryConsumption / Line | Issued qty + cost from inventory result |
| SaleTimelineEvent | Append-only narrative |
| SaleAnnulment | Reason + actor for annul |

## Commands

CreateSaleFromOrder, CreateDirectSale, CompleteSale, AnnulSale, GetSale, ListSales.

## Ports

OrdersSalesPort, InventoryIssuePort, AuditPort.

## Deferred

Payments, Delivery, Fiscalization, Shift/POS agent, multi-currency.
