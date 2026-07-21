/**
 * Permission codes — source of truth in code.
 * Format: module:action
 */

export type PermissionCode =
  | 'organization:read'
  | 'organization:manage'
  | 'stores:read'
  | 'stores:create'
  | 'stores:archive'
  | 'master-data:read'
  | 'master-data:manage'
  | 'supply:read'
  | 'supply:create'
  | 'supply:submit'
  | 'supply:receive'
  | 'supply:reverse'
  | 'inventory:read'
  | 'inventory:view-cost'
  | 'write-offs:read'
  | 'write-offs:create'
  | 'write-offs:post'
  | 'write-offs:reverse'
  | 'transfers:read'
  | 'transfers:create'
  | 'transfers:dispatch'
  | 'transfers:receive'
  | 'transfers:cancel'
  | 'inventory-counts:read'
  | 'inventory-counts:create'
  | 'inventory-counts:count'
  | 'inventory-counts:post'
  | 'inventory-counts:cancel'
  | 'inventory-adjustments:view-cost'
  | 'customers:read'
  | 'customers:manage'
  | 'orders:read'
  | 'orders:create'
  | 'orders:update'
  | 'orders:confirm'
  | 'orders:reserve'
  | 'orders:assign'
  | 'orders:prepare'
  | 'orders:cancel'
  | 'sales:read'
  | 'sales:create'
  | 'sales:complete'
  | 'sales:annul'
  | 'sales:view-cost'
  | 'sales:view-margin'
  | 'sales:discount'
  | 'sales:discount-override'
  | 'payments:read'
  | 'payments:create'
  | 'payments:complete'
  | 'payments:annul'
  | 'payments:refund'
  | 'payments:manage-methods'
  | 'payments:view-cash'
  | 'payments:manual-adjustment'
  | 'delivery:read'
  | 'delivery:create'
  | 'delivery:update'
  | 'delivery:assign'
  | 'delivery:dispatch'
  | 'delivery:complete'
  | 'delivery:cancel'
  | 'delivery:report-problem'
  | 'delivery:resolve-problem'
  | 'delivery:manage-couriers'
  | 'delivery:manage-routes'
  | 'delivery:view-payment-summary'
  | 'audit:read'
  | 'users:read'
  | 'users:manage'
  | 'roles:manage'
  | 'workspace:read'
  | 'operations:read';

export type PermissionDefinition = {
  readonly code: PermissionCode;
  readonly description: string;
};

export const PERMISSION_REGISTRY: readonly PermissionDefinition[] = [
  { code: 'organization:read', description: 'View organization profile and list accessible organizations' },
  { code: 'organization:manage', description: 'Create and archive organizations' },
  { code: 'stores:read', description: 'View stores and warehouses in scope' },
  { code: 'stores:create', description: 'Create stores and default warehouses' },
  { code: 'stores:archive', description: 'Archive stores' },
  { code: 'master-data:read', description: 'View master data' },
  { code: 'master-data:manage', description: 'Create and archive master data' },
  { code: 'supply:read', description: 'View supplies and goods receipts' },
  { code: 'supply:create', description: 'Create and edit draft supplies' },
  { code: 'supply:submit', description: 'Submit supplies to supplier' },
  { code: 'supply:receive', description: 'Create and post goods receipts' },
  { code: 'supply:reverse', description: 'Reverse posted goods receipts' },
  { code: 'inventory:read', description: 'View inventory balances, batches, and movements' },
  { code: 'inventory:view-cost', description: 'View purchase costs on inventory and receipts' },
  { code: 'write-offs:read', description: 'View write-off documents and history' },
  { code: 'write-offs:create', description: 'Create draft inventory write-offs' },
  { code: 'write-offs:post', description: 'Post write-off documents' },
  { code: 'write-offs:reverse', description: 'Reverse posted write-off documents' },
  { code: 'transfers:read', description: 'View transfer documents and in-transit inventory' },
  { code: 'transfers:create', description: 'Create draft inventory transfers' },
  { code: 'transfers:dispatch', description: 'Dispatch transfer documents from source warehouse' },
  { code: 'transfers:receive', description: 'Receive transfer documents into destination warehouse' },
  { code: 'transfers:cancel', description: 'Cancel or reverse transfer documents' },
  { code: 'inventory-counts:read', description: 'View inventory counts and progress' },
  { code: 'inventory-counts:create', description: 'Create inventory count snapshots' },
  { code: 'inventory-counts:count', description: 'Enter counted quantities for inventory counts' },
  { code: 'inventory-counts:post', description: 'Post inventory count adjustments' },
  { code: 'inventory-counts:cancel', description: 'Cancel inventory count documents' },
  { code: 'inventory-adjustments:view-cost', description: 'View cost amounts on write-offs, transfers, and count adjustments' },
  { code: 'customers:read', description: 'View customers' },
  { code: 'customers:manage', description: 'Create and archive customers' },
  { code: 'orders:read', description: 'View orders and order dashboard' },
  { code: 'orders:create', description: 'Create draft orders' },
  { code: 'orders:update', description: 'Update draft orders and composition' },
  { code: 'orders:confirm', description: 'Confirm orders' },
  { code: 'orders:reserve', description: 'Retry stock reservation' },
  { code: 'orders:assign', description: 'Assign florists to orders' },
  { code: 'orders:prepare', description: 'Start preparation, edit actual composition, mark ready/complete' },
  { code: 'orders:cancel', description: 'Cancel orders' },
  { code: 'sales:read', description: 'View sales' },
  { code: 'sales:create', description: 'Create draft sales' },
  { code: 'sales:complete', description: 'Complete sales and issue stock' },
  { code: 'sales:annul', description: 'Annul completed sales' },
  { code: 'sales:view-cost', description: 'View sale COGS' },
  { code: 'sales:view-margin', description: 'View sale margin and profit' },
  { code: 'sales:discount', description: 'Apply discounts within threshold' },
  { code: 'sales:discount-override', description: 'Apply discounts above threshold' },
  { code: 'payments:read', description: 'View payments, refunds, and payment history' },
  { code: 'payments:create', description: 'Create draft payments and allocations' },
  { code: 'payments:complete', description: 'Complete payments' },
  { code: 'payments:annul', description: 'Annul completed payments' },
  { code: 'payments:refund', description: 'Create, complete, and annul refunds' },
  { code: 'payments:manage-methods', description: 'Manage payment methods' },
  { code: 'payments:view-cash', description: 'View cash accounts and operations' },
  { code: 'payments:manual-adjustment', description: 'Create manual cash adjustments' },
  { code: 'delivery:read', description: 'View deliveries, board, map, and calendar' },
  { code: 'delivery:create', description: 'Create delivery jobs from orders' },
  { code: 'delivery:update', description: 'Plan deliveries and update address/coordinates' },
  { code: 'delivery:assign', description: 'Assign, reassign, and release couriers' },
  { code: 'delivery:dispatch', description: 'Mark ready for dispatch, handover, and start transit' },
  { code: 'delivery:complete', description: 'Mark deliveries as delivered' },
  { code: 'delivery:cancel', description: 'Cancel delivery jobs' },
  { code: 'delivery:report-problem', description: 'Report delivery problems' },
  { code: 'delivery:resolve-problem', description: 'Resolve delivery problems' },
  { code: 'delivery:manage-couriers', description: 'Create and archive courier profiles' },
  { code: 'delivery:manage-routes', description: 'Create and manage delivery route plans' },
  { code: 'delivery:view-payment-summary', description: 'View payment balance on delivery summary' },
  { code: 'audit:read', description: 'View audit log entries' },
  { code: 'users:read', description: 'View organization users' },
  { code: 'users:manage', description: 'Create, block, archive users and reset passwords' },
  { code: 'roles:manage', description: 'Assign roles and store access' },
  { code: 'workspace:read', description: 'View florist Today workspace and work-order projections' },
  { code: 'operations:read', description: 'View director Operations attention board and KPIs' },
] as const;

export const ALL_PERMISSION_CODES: readonly PermissionCode[] = PERMISSION_REGISTRY.map((p) => p.code);

export function isPermissionCode(value: string): value is PermissionCode {
  return ALL_PERMISSION_CODES.includes(value as PermissionCode);
}

export const DIRECTOR_PERMISSIONS: readonly PermissionCode[] = ALL_PERMISSION_CODES;

export const FLORIST_PERMISSIONS: readonly PermissionCode[] = [
  'organization:read',
  'stores:read',
  'master-data:read',
  'supply:read',
  'supply:create',
  'supply:submit',
  'supply:receive',
  'inventory:read',
  'write-offs:read',
  'write-offs:create',
  'transfers:read',
  'inventory-counts:read',
  'inventory-counts:count',
  'customers:read',
  'orders:read',
  'orders:create',
  'orders:update',
  'orders:confirm',
  'orders:reserve',
  'orders:assign',
  'orders:prepare',
  'orders:cancel',
  'sales:read',
  'sales:create',
  'sales:complete',
  'sales:discount',
  'payments:read',
  'payments:create',
  'payments:complete',
  'delivery:read',
  'delivery:create',
  'delivery:update',
  'delivery:dispatch',
  'delivery:report-problem',
  'workspace:read',
];

/** Courier field role — delivery execution only; no inventory/finance/admin. */
export const COURIER_PERMISSIONS: readonly PermissionCode[] = [
  'organization:read',
  'stores:read',
  'delivery:read',
  'delivery:dispatch',
  'delivery:complete',
  'delivery:report-problem',
];

export const SYSTEM_ROLE_PRESETS = {
  DIRECTOR: {
    code: 'DIRECTOR',
    name: 'Director',
    permissions: DIRECTOR_PERMISSIONS,
  },
  FLORIST: {
    code: 'FLORIST',
    name: 'Florist',
    permissions: FLORIST_PERMISSIONS,
  },
  COURIER: {
    code: 'COURIER',
    name: 'Courier',
    permissions: COURIER_PERMISSIONS,
  },
} as const;

export type SystemRoleCode = keyof typeof SYSTEM_ROLE_PRESETS;
