import {
  type ApiErrorBody,
  type HealthLiveResponse,
  type HealthReadyResponse,
  type RequestId,
} from '@flower/contracts';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: RequestId;
  readonly details: unknown[];

  constructor(input: {
    message: string;
    code: string;
    status: number;
    requestId: RequestId;
    details?: unknown[];
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.details = input.details ?? [];
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getRequestId?: () => RequestId;
  /** In-memory access token — never localStorage. */
  getAccessToken?: () => string | null;
  credentials?: RequestCredentials;
};

function createRequestId(): RequestId {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') {
    return false;
  }
  const body = error as Record<string, unknown>;
  return (
    typeof body.code === 'string' &&
    typeof body.message === 'string' &&
    typeof body.requestId === 'string' &&
    Array.isArray(body.details)
  );
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const requestId = options.getRequestId?.() ?? createRequestId();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('x-request-id', requestId);
    const token = options.getAccessToken?.();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: options.credentials ?? init.credentials,
      headers,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = contentType.includes('application/json')
      ? await response.json()
      : undefined;

    if (!response.ok) {
      if (isApiErrorBody(payload)) {
        throw new ApiClientError({
          message: payload.error.message,
          code: payload.error.code,
          status: response.status,
          requestId: payload.error.requestId,
          details: payload.error.details,
        });
      }
      throw new ApiClientError({
        message: `HTTP ${response.status}`,
        code: 'HTTP_ERROR',
        status: response.status,
        requestId,
      });
    }

    return payload as T;
  }

  return {
    request,
    login: (body: { login: string; password: string; organizationId?: string }) =>
      request<{
        accessToken: string;
        user: { id: string; login: string; displayName: string };
        organization: { id: string; name: string };
        permissions: string[];
      }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      }),
    refresh: () =>
      request<{ accessToken: string }>('/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      }),
    logout: () =>
      request<void>('/auth/logout', { method: 'POST', credentials: 'include' }),
    logoutAll: () =>
      request<void>('/auth/logout-all', { method: 'POST', credentials: 'include' }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<void>('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      }),
    listSessions: () =>
      request<
        Array<{
          id: string;
          status: string;
          expiresAt: string;
          lastUsedAt: string;
          revokedAt: string | null;
        }>
      >('/auth/sessions'),
    revokeSession: (sessionId: string) =>
      request<void>(`/auth/sessions/${sessionId}/revoke`, { method: 'POST', credentials: 'include' }),
    me: () =>
      request<{
        user: { id: string; displayName: string; login: string };
        organization: { id: string; name: string };
        permissions: string[];
      }>('/auth/me'),
    getLiveHealth: () => request<HealthLiveResponse>('/health/live'),
    getReadyHealth: () => request<HealthReadyResponse>('/health/ready'),
    listOrganizations: (page = 1, pageSize = 20) =>
      request<{
        items: Array<{
          id: string;
          name: string;
          status: string;
          createdAt: string;
        }>;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      }>(`/organizations?page=${page}&pageSize=${pageSize}`),
    createOrganization: (body: { name: string }) =>
      request<{ id: string; name: string; status: string }>('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getOrganization: (organizationId: string) =>
      request<{ id: string; name: string; status: string }>(`/organizations/${organizationId}`),
    listUsers: (organizationId: string) =>
      request<
        Array<{
          id: string;
          login: string;
          displayName: string;
          status: string;
          membershipId: string;
        }>
      >(`/organizations/${organizationId}/users`),
    createUser: (
      organizationId: string,
      body: { login: string; password: string; displayName: string; email?: string },
    ) =>
      request<{ id: string; login: string; displayName: string }>(
        `/organizations/${organizationId}/users`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    listRoles: (organizationId: string) =>
      request<
        Array<{
          id: string;
          code: string;
          name: string;
          isSystem: boolean;
          permissions: string[];
        }>
      >(`/organizations/${organizationId}/roles`),
    listAudit: (
      organizationId: string,
      query?: { storeId?: string; action?: string; entityType?: string; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (query?.storeId) params.set('storeId', query.storeId);
      if (query?.action) params.set('action', query.action);
      if (query?.entityType) params.set('entityType', query.entityType);
      if (query?.limit) params.set('limit', String(query.limit));
      const qs = params.toString();
      return request<
        Array<{
          id: string;
          action: string;
          entityType: string;
          entityId: string;
          actorId: string | null;
          createdAt: string;
        }>
      >(`/organizations/${organizationId}/audit${qs ? `?${qs}` : ''}`);
    },
    listStores: (organizationId: string, page = 1, pageSize = 20) =>
      request<{
        items: Array<{
          id: string;
          name: string;
          code: string;
          status: string;
          timezone: string;
        }>;
        page: number;
        pageSize: number;
        totalItems: number;
      }>(`/organizations/${organizationId}/stores?page=${page}&pageSize=${pageSize}`),
    createStore: (
      organizationId: string,
      body: { name: string; code: string; address?: string; timezone?: string },
    ) =>
      request<{
        store: { id: string; name: string; code: string; status: string };
        warehouse: {
          id: string;
          name: string;
          code: string;
          isDefault: boolean;
        };
      }>(`/organizations/${organizationId}/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getStore: (organizationId: string, storeId: string) =>
      request<{
        id: string;
        name: string;
        code: string;
        status: string;
        address: string | null;
        timezone: string;
      }>(`/organizations/${organizationId}/stores/${storeId}`),
    listWarehouses: (organizationId: string, storeId: string) =>
      request<
        Array<{
          id: string;
          name: string;
          code: string;
          isDefault: boolean;
          type: string;
          status: string;
        }>
      >(`/organizations/${organizationId}/stores/${storeId}/warehouses`),
    ensureDefaultWarehouse: (organizationId: string, storeId: string) =>
      request<
        Array<{
          id: string;
          name: string;
          code: string;
          isDefault: boolean;
          type: string;
          status: string;
        }>
      >(`/organizations/${organizationId}/stores/${storeId}/warehouses/ensure-default`, {
        method: 'POST',
      }),

    // ─── Master data ────────────────────────────────────────────────────────
    listSuppliers: (
      organizationId: string,
      params: { page?: number; pageSize?: number; status?: string; name?: string } = {},
    ) => {
      const q = new URLSearchParams();
      q.set('page', String(params.page ?? 1));
      q.set('pageSize', String(params.pageSize ?? 20));
      if (params.status) q.set('status', params.status);
      if (params.name) q.set('name', params.name);
      return request<{
        items: Array<{
          id: string;
          name: string;
          code: string;
          status: string;
          country: string | null;
          phone: string | null;
          email: string | null;
          contactPerson: string | null;
        }>;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      }>(`/organizations/${organizationId}/suppliers?${q}`);
    },
    createSupplier: (
      organizationId: string,
      body: {
        name: string;
        code: string;
        country?: string;
        phone?: string;
        email?: string;
        contactPerson?: string;
        comment?: string;
      },
    ) =>
      request<{ id: string; name: string; code: string; status: string }>(
        `/organizations/${organizationId}/suppliers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    getSupplier: (organizationId: string, supplierId: string) =>
      request<{
        id: string;
        name: string;
        code: string;
        status: string;
        country: string | null;
        phone: string | null;
        email: string | null;
        contactPerson: string | null;
        comment: string | null;
      }>(`/organizations/${organizationId}/suppliers/${supplierId}`),
    archiveSupplier: (organizationId: string, supplierId: string, reason?: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/suppliers/${supplierId}/archive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      ),
    listCategories: (organizationId: string, page = 1, pageSize = 20) =>
      request<{
        items: Array<{
          id: string;
          name: string;
          code: string;
          parentId: string | null;
          status: string;
        }>;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      }>(`/organizations/${organizationId}/categories?page=${page}&pageSize=${pageSize}`),
    createCategory: (
      organizationId: string,
      body: { name: string; code: string; parentId?: string },
    ) =>
      request<{ id: string; name: string; code: string; parentId: string | null; status: string }>(
        `/organizations/${organizationId}/categories`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    getCategory: (organizationId: string, categoryId: string) =>
      request<{
        id: string;
        name: string;
        code: string;
        parentId: string | null;
        status: string;
      }>(`/organizations/${organizationId}/categories/${categoryId}`),
    archiveCategory: (organizationId: string, categoryId: string, reason?: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/categories/${categoryId}/archive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      ),
    listUnits: (organizationId: string, page = 1, pageSize = 20) =>
      request<{
        items: Array<{ id: string; name: string; symbol: string; status: string }>;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      }>(`/organizations/${organizationId}/units?page=${page}&pageSize=${pageSize}`),
    createUnit: (organizationId: string, body: { name: string; symbol: string }) =>
      request<{ id: string; name: string; symbol: string; status: string }>(
        `/organizations/${organizationId}/units`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    archiveUnit: (organizationId: string, unitId: string, reason?: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/units/${unitId}/archive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      ),
    listPolicies: (organizationId: string, page = 1, pageSize = 20) =>
      request<{
        items: Array<{
          id: string;
          name: string;
          itemType: string;
          trackingMethod: string;
          expirationTracking: boolean;
          status: string;
        }>;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      }>(`/organizations/${organizationId}/policies?page=${page}&pageSize=${pageSize}`),
    createPolicy: (
      organizationId: string,
      body: {
        name: string;
        itemType: 'FLOWER' | 'MATERIAL';
        trackingMethod: 'LOT' | 'NONE';
        reservationAllowed?: boolean;
        expirationTracking: boolean;
        allowFractionalQuantity?: boolean;
        defaultShelfLifeDays?: number;
      },
    ) =>
      request<{
        id: string;
        name: string;
        itemType: string;
        trackingMethod: string;
        status: string;
      }>(`/organizations/${organizationId}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    archivePolicy: (organizationId: string, policyId: string, reason?: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/policies/${policyId}/archive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      ),
    listItems: (
      organizationId: string,
      params: {
        page?: number;
        pageSize?: number;
        categoryId?: string;
        itemType?: string;
        status?: string;
        name?: string;
        code?: string;
        sortBy?: string;
        sortDir?: string;
      } = {},
    ) => {
      const q = new URLSearchParams();
      q.set('page', String(params.page ?? 1));
      q.set('pageSize', String(params.pageSize ?? 20));
      if (params.categoryId) q.set('categoryId', params.categoryId);
      if (params.itemType) q.set('itemType', params.itemType);
      if (params.status) q.set('status', params.status);
      if (params.name) q.set('name', params.name);
      if (params.code) q.set('code', params.code);
      if (params.sortBy) q.set('sortBy', params.sortBy);
      if (params.sortDir) q.set('sortDir', params.sortDir);
      return request<{
        items: Array<{
          id: string;
          name: string;
          code: string;
          itemType: string;
          status: string;
          categoryId: string;
          unitId: string;
          inventoryPolicyId: string;
          isSellable?: boolean;
          isPurchasable?: boolean;
        }>;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      }>(`/organizations/${organizationId}/items?${q}`);
    },
    createItem: (
      organizationId: string,
      body: {
        categoryId: string;
        unitId: string;
        inventoryPolicyId: string;
        name: string;
        code: string;
        itemType: 'FLOWER' | 'MATERIAL';
        description?: string;
        isSellable?: boolean;
        isPurchasable?: boolean;
      },
    ) =>
      request<{
        id: string;
        name: string;
        code: string;
        itemType: string;
        status: string;
        isSellable?: boolean;
      }>(`/organizations/${organizationId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getItem: (organizationId: string, itemId: string) =>
      request<{
        id: string;
        name: string;
        code: string;
        itemType: string;
        status: string;
        categoryId: string;
        unitId: string;
        inventoryPolicyId: string;
        description: string | null;
        isSellable?: boolean;
        isPurchasable?: boolean;
      }>(`/organizations/${organizationId}/items/${itemId}`),
    archiveItem: (organizationId: string, itemId: string, reason?: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/items/${itemId}/archive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      ),
    listSupplies: (organizationId: string, storeId: string, status?: string) =>
      request<Array<{
        id: string;
        number: string;
        status: string;
        supplierId: string;
        warehouseId: string;
        supplier?: { name: string; code: string };
      }>>(`/organizations/${organizationId}/stores/${storeId}/supplies${status ? `?status=${status}` : ''}`),
    createSupply: (
      organizationId: string,
      storeId: string,
      body: { warehouseId: string; supplierId: string; expectedReceiptDate?: string; comment?: string },
    ) =>
      request<{ id: string; number: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/supplies`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      ),
    getSupply: (organizationId: string, storeId: string, supplyId: string) =>
      request<{
        id: string;
        number: string;
        status: string;
        warehouseId: string;
        supplierId: string;
        comment: string | null;
        supplier?: { name: string; code: string };
        items: Array<{
          id: string;
          itemId: string;
          orderedQuantity: string;
          plannedUnitPrice: string | null;
          item?: { name: string; code: string };
        }>;
      }>(`/organizations/${organizationId}/stores/${storeId}/supplies/${supplyId}`),
    addSupplyItem: (
      organizationId: string,
      storeId: string,
      supplyId: string,
      body: { itemId: string; orderedQuantity: string; plannedUnitPrice?: string },
    ) =>
      request<unknown>(`/organizations/${organizationId}/stores/${storeId}/supplies/${supplyId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    submitSupply: (organizationId: string, storeId: string, supplyId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/supplies/${supplyId}/submit`,
        { method: 'POST' },
      ),
    createGoodsReceipt: (
      organizationId: string,
      storeId: string,
      supplyId: string,
      body: { receivedAt: string; comment?: string },
    ) =>
      request<{ id: string; number: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/supplies/${supplyId}/receipts`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      ),
    listGoodsReceipts: (organizationId: string, storeId: string, supplyId: string) =>
      request<Array<{ id: string; number: string; status: string }>>(
        `/organizations/${organizationId}/stores/${storeId}/supplies/${supplyId}/receipts`,
      ),
    getGoodsReceipt: (organizationId: string, storeId: string, goodsReceiptId: string) =>
      request<{
        id: string;
        number: string;
        status: string;
        supplyId: string;
        items: Array<{
          id: string;
          supplyItemId: string;
          itemId: string;
          receivedQuantity: string;
          acceptedQuantity: string;
          defectiveQuantity: string;
          actualUnitPrice: string;
        }>;
      }>(`/organizations/${organizationId}/stores/${storeId}/goods-receipts/${goodsReceiptId}`),
    addGoodsReceiptItem: (
      organizationId: string,
      storeId: string,
      goodsReceiptId: string,
      body: {
        supplyItemId: string;
        receivedQuantity: string;
        acceptedQuantity: string;
        defectiveQuantity: string;
        actualUnitPrice: string;
        defectReason?: string;
      },
    ) =>
      request<unknown>(
        `/organizations/${organizationId}/stores/${storeId}/goods-receipts/${goodsReceiptId}/items`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      ),
    postGoodsReceipt: (
      organizationId: string,
      storeId: string,
      goodsReceiptId: string,
      idempotencyKey?: string,
    ) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/goods-receipts/${goodsReceiptId}/post`,
        {
          method: 'POST',
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        },
      ),
    reverseGoodsReceipt: (
      organizationId: string,
      storeId: string,
      goodsReceiptId: string,
      idempotencyKey?: string,
    ) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/goods-receipts/${goodsReceiptId}/reverse`,
        {
          method: 'POST',
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        },
      ),
    listInventory: (organizationId: string, storeId: string, warehouseId: string) =>
      request<
        Array<{
          id: string;
          itemId: string;
          onHandQuantity: string;
          availableQuantity: string;
          item?: { name: string; code: string };
        }>
      >(`/organizations/${organizationId}/stores/${storeId}/warehouses/${warehouseId}/inventory`),
    listInventoryBatches: (organizationId: string, storeId: string, warehouseId: string) =>
      request<
        Array<{
          id: string;
          itemId: string;
          initialQuantity: string;
          remainingQuantity: string;
          status: string;
          item?: { name: string; code: string };
        }>
      >(`/organizations/${organizationId}/stores/${storeId}/warehouses/${warehouseId}/batches`),
    listInventoryMovements: (organizationId: string, storeId: string, warehouseId: string) =>
      request<
        Array<{
          id: string;
          type: string;
          quantity: string;
          itemId: string;
          occurredAt: string;
          item?: { name: string; code: string };
        }>
      >(`/organizations/${organizationId}/stores/${storeId}/warehouses/${warehouseId}/movements`),

    listCustomers: (organizationId: string, q?: string) =>
      request<
        Array<{
          id: string;
          organizationId: string;
          name: string;
          phone: string;
          email: string | null;
          notes: string | null;
          preferredLanguage: string | null;
          status: string;
          createdAt: string;
          updatedAt: string;
        }>
      >(`/organizations/${organizationId}/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    createCustomer: (
      organizationId: string,
      body: {
        name: string;
        phone: string;
        email?: string;
        notes?: string;
        preferredLanguage?: string;
      },
    ) =>
      request<{
        id: string;
        organizationId: string;
        name: string;
        phone: string;
        email: string | null;
        notes: string | null;
        preferredLanguage: string | null;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>(`/organizations/${organizationId}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    archiveCustomer: (organizationId: string, customerId: string) =>
      request<void>(`/organizations/${organizationId}/customers/${customerId}/archive`, {
        method: 'POST',
      }),

    listOrders: (organizationId: string, storeId: string, status?: string) =>
      request<
        Array<{
          id: string;
          number: string;
          status: string;
          type: string;
          occasion: string;
          readyAt: string | null;
          recipientName: string | null;
          customerId: string | null;
          plannedPrice: string | null;
          hasDeficit?: boolean;
        }>
      >(`/organizations/${organizationId}/stores/${storeId}/orders${status ? `?status=${status}` : ''}`),
    getOrderDashboard: (organizationId: string, storeId: string) =>
      request<{
        today: Array<{ id: string; number: string; status: string; readyAt: string | null }>;
        overdue: Array<{ id: string; number: string; status: string; readyAt: string | null }>;
        unassigned: Array<{ id: string; number: string; status: string; readyAt: string | null }>;
        partiallyReserved: Array<{
          id: string;
          number: string;
          status: string;
          readyAt: string | null;
        }>;
        ready: Array<{ id: string; number: string; status: string; readyAt: string | null }>;
        inProgress: Array<{ id: string; number: string; status: string; readyAt: string | null }>;
      }>(`/organizations/${organizationId}/stores/${storeId}/orders/dashboard`),
    createOrder: (
      organizationId: string,
      storeId: string,
      body: {
        warehouseId: string;
        type?: string;
        occasion?: string;
        customerId?: string;
        readyAt?: string;
        recipientName?: string;
        recipientPhone?: string;
        comment?: string;
        referenceUrl?: string;
        referenceComment?: string;
        plannedPrice?: string;
      },
    ) =>
      request<{ id: string; number: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      ),
    getOrder: (organizationId: string, storeId: string, orderId: string) =>
      request<{
        id: string;
        number: string;
        status: string;
        type: string;
        occasion: string;
        warehouseId: string;
        customerId: string | null;
        readyAt: string | null;
        recipientName: string | null;
        recipientPhone: string | null;
        customerNameSnapshot: string | null;
        customerPhoneSnapshot: string | null;
        comment: string | null;
        referenceUrl: string | null;
        referenceComment: string | null;
        plannedPrice: string | null;
        assignedFloristId: string | null;
        hasDeficit?: boolean;
        composition: {
          id: string;
          items: Array<{
            id: string;
            itemId: string;
            plannedQuantity: string;
            comment: string | null;
            sortOrder: number;
            reservedQuantity?: string;
            deficitQuantity?: string;
            item?: { id: string; name: string; code: string };
          }>;
        } | null;
        actualComposition: {
          id: string;
          frozenAt: string | null;
          items: Array<{
            id: string;
            itemId: string;
            actualQuantity: string;
            batchId: string | null;
            comment: string | null;
            sortOrder: number;
            item?: { id: string; name: string; code: string };
          }>;
        } | null;
        activeAssignment: {
          id: string;
          membershipId: string;
          assignedAt: string;
          releasedAt: string | null;
        } | null;
        timeline: Array<{
          id: string;
          type: string;
          message: string | null;
          actorMembershipId: string | null;
          occurredAt: string;
        }>;
        comments: Array<{
          id: string;
          authorMembershipId: string;
          message: string;
          createdAt: string;
        }>;
      }>(`/organizations/${organizationId}/stores/${storeId}/orders/${orderId}`),
    updateOrder: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: {
        type?: string;
        occasion?: string;
        warehouseId?: string;
        customerId?: string | null;
        readyAt?: string | null;
        recipientName?: string | null;
        recipientPhone?: string | null;
        comment?: string | null;
        referenceUrl?: string | null;
        referenceComment?: string | null;
        plannedPrice?: string | null;
      },
    ) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    setOrderComposition: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: {
        items: Array<{ itemId: string; plannedQuantity: string; comment?: string; sortOrder?: number }>;
      },
    ) =>
      request<unknown>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/composition`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    addCompositionItem: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: { itemId: string; plannedQuantity: string; comment?: string; sortOrder?: number },
    ) =>
      request<unknown>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/composition/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    setActualComposition: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: {
        expectedVersion: number;
        items: Array<{
          itemId: string;
          actualQuantity: string;
          batchId?: string | null;
          comment?: string;
          sortOrder?: number;
        }>;
      },
    ) =>
      request<unknown>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/actual-composition`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    replaceCompositionItem: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: {
        expectedVersion: number;
        fromItemId: string;
        toItemId: string;
        quantity: string;
        reason: CompositionReplaceReason;
        comment?: string | null;
      },
    ) =>
      request<unknown>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/composition/replacements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    confirmOrder: (organizationId: string, storeId: string, orderId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/confirm`,
        { method: 'POST' },
      ),
    reserveOrder: (organizationId: string, storeId: string, orderId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/reserve`,
        { method: 'POST' },
      ),
    assignFlorist: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: { membershipId: string },
    ) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/assign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    claimOrder: (organizationId: string, storeId: string, orderId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/claim`,
        { method: 'POST' },
      ),
    claimNextOrder: (organizationId: string, storeId: string) =>
      request<{
        code: 'OK' | 'NO_ORDER_AVAILABLE';
        order: { id: string; number: string; status: string } | null;
      }>(`/organizations/${organizationId}/stores/${storeId}/orders/claim-next`, {
        method: 'POST',
      }),
    reassignOrder: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: { membershipId: string; reason: string },
    ) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/reassign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    releaseAssignment: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: { reason: string },
    ) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/assignment/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    startOrderPreparation: (organizationId: string, storeId: string, orderId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/start-preparation`,
        { method: 'POST' },
      ),
    markOrderReady: (organizationId: string, storeId: string, orderId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/mark-ready`,
        { method: 'POST' },
      ),
    completeOrder: (organizationId: string, storeId: string, orderId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/complete`,
        { method: 'POST' },
      ),
    cancelOrder: (organizationId: string, storeId: string, orderId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/cancel`,
        { method: 'POST' },
      ),
    addOrderComment: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: { message: string },
    ) =>
      request<unknown>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),

    // ─── Workspace / operations ───────────────────────────────────────────────
    getWorkspaceToday: (organizationId: string, storeId: string) =>
      request<WorkspaceTodayDto>(
        `/organizations/${organizationId}/stores/${storeId}/workspace/today`,
      ),
    listWorkspaceOrders: (
      organizationId: string,
      storeId: string,
      query?: { filter?: WorkspaceFilter; offset?: number; limit?: number },
    ) => {
      const q = new URLSearchParams();
      if (query?.filter) q.set('filter', query.filter);
      if (query?.offset != null) q.set('offset', String(query.offset));
      if (query?.limit != null) q.set('limit', String(query.limit));
      const qs = q.toString();
      return request<WorkspaceOrdersListDto>(
        `/organizations/${organizationId}/stores/${storeId}/workspace/orders${qs ? `?${qs}` : ''}`,
      );
    },
    getWorkOrder: (organizationId: string, storeId: string, orderId: string) =>
      request<WorkOrderDto>(
        `/organizations/${organizationId}/stores/${storeId}/workspace/orders/${orderId}`,
      ),
    getOperations: (organizationId: string, storeId: string) =>
      request<OperationsBoardDto>(
        `/organizations/${organizationId}/stores/${storeId}/operations`,
      ),
    getOperationalStock: (organizationId: string, storeId: string) =>
      request<OperationalStockDto>(
        `/organizations/${organizationId}/stores/${storeId}/stock/operational`,
      ),
    listWriteOffs: (organizationId: string, storeId: string) =>
      request<WriteOffDto[]>(`/organizations/${organizationId}/stores/${storeId}/write-offs`),
    getWriteOff: (organizationId: string, storeId: string, writeOffId: string) =>
      request<WriteOffDto>(
        `/organizations/${organizationId}/stores/${storeId}/write-offs/${writeOffId}`,
      ),
    createWriteOff: (
      organizationId: string,
      storeId: string,
      body: { warehouseId: string; reason: WriteOffReason; comment?: string | null },
    ) =>
      request<WriteOffDto>(`/organizations/${organizationId}/stores/${storeId}/write-offs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    addWriteOffItem: (
      organizationId: string,
      storeId: string,
      writeOffId: string,
      body: { itemId: string; quantity: string },
    ) =>
      request<WriteOffDto>(
        `/organizations/${organizationId}/stores/${storeId}/write-offs/${writeOffId}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    postWriteOff: (
      organizationId: string,
      storeId: string,
      writeOffId: string,
      idempotencyKey: string,
    ) =>
      request<WriteOffDto>(
        `/organizations/${organizationId}/stores/${storeId}/write-offs/${writeOffId}/post`,
        { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    reverseWriteOff: (
      organizationId: string,
      storeId: string,
      writeOffId: string,
      idempotencyKey: string,
    ) =>
      request<WriteOffDto>(
        `/organizations/${organizationId}/stores/${storeId}/write-offs/${writeOffId}/reverse`,
        { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    listTransfers: (organizationId: string, storeId: string) =>
      request<TransferDto[]>(`/organizations/${organizationId}/stores/${storeId}/transfers`),
    getTransfer: (organizationId: string, storeId: string, transferId: string) =>
      request<TransferDto>(
        `/organizations/${organizationId}/stores/${storeId}/transfers/${transferId}`,
      ),
    getTransferTimeline: (organizationId: string, storeId: string, transferId: string) =>
      request<TransferTimelineDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/transfers/${transferId}/timeline`,
      ),
    createTransfer: (
      organizationId: string,
      storeId: string,
      body: { fromWarehouseId: string; toWarehouseId: string; comment?: string | null },
    ) =>
      request<TransferDto>(`/organizations/${organizationId}/stores/${storeId}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    addTransferItem: (
      organizationId: string,
      storeId: string,
      transferId: string,
      body: { itemId: string; requestedQuantity: string },
    ) =>
      request<TransferDto>(
        `/organizations/${organizationId}/stores/${storeId}/transfers/${transferId}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    dispatchTransfer: (
      organizationId: string,
      storeId: string,
      transferId: string,
      body: { expectedVersion: number; items: Array<{ transferItemId: string; dispatchQuantity: string }> },
      idempotencyKey: string,
    ) =>
      request<TransferDto>(
        `/organizations/${organizationId}/stores/${storeId}/transfers/${transferId}/dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(body),
        },
      ),
    receiveTransfer: (
      organizationId: string,
      storeId: string,
      transferId: string,
      body: {
        expectedVersion: number;
        allocations: Array<{
          transferAllocationId: string;
          transferItemId: string;
          itemId: string;
          receivedQuantity: string;
          damagedQuantity: string;
        }>;
      },
      idempotencyKey: string,
    ) =>
      request<TransferDto>(
        `/organizations/${organizationId}/stores/${storeId}/transfers/${transferId}/receive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(body),
        },
      ),
    cancelTransfer: (
      organizationId: string,
      storeId: string,
      transferId: string,
      body: { expectedVersion: number },
      idempotencyKey?: string,
    ) =>
      request<TransferDto>(
        `/organizations/${organizationId}/stores/${storeId}/transfers/${transferId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          body: JSON.stringify(body),
        },
      ),
    reverseTransfer: (
      organizationId: string,
      storeId: string,
      transferId: string,
      body: { expectedVersion: number },
      idempotencyKey: string,
    ) =>
      request<TransferDto>(
        `/organizations/${organizationId}/stores/${storeId}/transfers/${transferId}/reverse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(body),
        },
      ),
    listInventoryCounts: (organizationId: string, storeId: string) =>
      request<InventoryCountDto[]>(`/organizations/${organizationId}/stores/${storeId}/inventory-counts`),
    getInventoryCount: (organizationId: string, storeId: string, inventoryCountId: string) =>
      request<InventoryCountDto>(
        `/organizations/${organizationId}/stores/${storeId}/inventory-counts/${inventoryCountId}`,
      ),
    createInventoryCount: (
      organizationId: string,
      storeId: string,
      body: { warehouseId: string; comment?: string | null },
    ) =>
      request<InventoryCountDto>(
        `/organizations/${organizationId}/stores/${storeId}/inventory-counts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    countInventory: (
      organizationId: string,
      storeId: string,
      inventoryCountId: string,
      body: {
        expectedVersion: number;
        items: Array<{ inventoryCountItemId: string; countedQuantity: string }>;
      },
    ) =>
      request<InventoryCountDto>(
        `/organizations/${organizationId}/stores/${storeId}/inventory-counts/${inventoryCountId}/count`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    postInventoryCount: (
      organizationId: string,
      storeId: string,
      inventoryCountId: string,
      body: { expectedVersion: number },
      idempotencyKey: string,
    ) =>
      request<InventoryCountDto>(
        `/organizations/${organizationId}/stores/${storeId}/inventory-counts/${inventoryCountId}/post`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(body),
        },
      ),
    cancelInventoryCount: (
      organizationId: string,
      storeId: string,
      inventoryCountId: string,
    ) =>
      request<InventoryCountDto>(
        `/organizations/${organizationId}/stores/${storeId}/inventory-counts/${inventoryCountId}/cancel`,
        { method: 'POST' },
      ),
    getInventoryAttention: (organizationId: string, storeId: string) =>
      request<InventoryOpsAttentionDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/operations/inventory/attention`,
      ),
    getInventoryInTransit: (organizationId: string, storeId: string) =>
      request<InventoryTransitDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/operations/inventory/in-transit`,
      ),
    getInventoryLosses: (organizationId: string, storeId: string) =>
      request<InventoryLossDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/operations/inventory/losses`,
      ),
    getInventoryCountProgress: (organizationId: string, storeId: string) =>
      request<InventoryCountProgressDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/operations/inventory/count-progress`,
      ),

    listSales: (
      organizationId: string,
      storeId: string,
      query?: { status?: string; type?: string; orderId?: string },
    ) => {
      const q = new URLSearchParams();
      if (query?.status) q.set('status', query.status);
      if (query?.type) q.set('type', query.type);
      if (query?.orderId) q.set('orderId', query.orderId);
      const qs = q.toString();
      return request<SaleDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/sales${qs ? `?${qs}` : ''}`,
      );
    },
    getSale: (organizationId: string, storeId: string, saleId: string) =>
      request<SaleDto>(
        `/organizations/${organizationId}/stores/${storeId}/sales/${saleId}`,
      ),
    createSaleFromOrder: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body?: {
        salesChannel?: string;
        unitPrice?: string;
        comment?: string;
        discount?: SaleDiscountInput;
      },
      options?: { idempotencyKey?: string },
    ) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options?.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
      }
      return request<SaleDto>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/sales`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ orderId, ...body }),
        },
      );
    },
    createDirectSale: (
      organizationId: string,
      storeId: string,
      body: {
        warehouseId: string;
        salesChannel?: string;
        comment?: string;
        lines: Array<{
          itemId: string;
          quantity: string;
          unitPrice: string;
          description?: string;
        }>;
        discount?: SaleDiscountInput;
      },
    ) =>
      request<SaleDto>(`/organizations/${organizationId}/stores/${storeId}/sales/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    completeSale: (
      organizationId: string,
      storeId: string,
      saleId: string,
      idempotencyKey: string,
    ) =>
      request<SaleDto>(
        `/organizations/${organizationId}/stores/${storeId}/sales/${saleId}/complete`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      ),
    annulSale: (
      organizationId: string,
      storeId: string,
      saleId: string,
      body: { reason: string },
      idempotencyKey: string,
    ) =>
      request<SaleDto>(
        `/organizations/${organizationId}/stores/${storeId}/sales/${saleId}/annul`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(body),
        },
      ),
    getSaleTimeline: (organizationId: string, storeId: string, saleId: string) =>
      request<
        Array<{
          id: string;
          type: string;
          message: string | null;
          actorMembershipId: string | null;
          payload: unknown;
          occurredAt: string;
          createdAt: string;
        }>
      >(`/organizations/${organizationId}/stores/${storeId}/sales/${saleId}/timeline`),
    getSaleConsumption: (organizationId: string, storeId: string, saleId: string) =>
      request<{
        id: string;
        saleId: string;
        sourceType: string;
        createdAt: string;
        lines: Array<{
          id: string;
          itemId: string;
          requestedQuantity: string;
          issuedQuantity: string;
          costAmount?: string;
          createdAt: string;
        }>;
      } | null>(`/organizations/${organizationId}/stores/${storeId}/sales/${saleId}/consumption`),

    // ─── Payments ─────────────────────────────────────────────────────────────
    ensureDefaultPaymentMethods: (organizationId: string, storeId: string) =>
      request<PaymentMethodDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/payment-methods/ensure-defaults`,
        { method: 'POST' },
      ),
    listPaymentMethods: (
      organizationId: string,
      storeId: string,
      query?: { activeOnly?: boolean },
    ) => {
      const q = new URLSearchParams();
      if (query?.activeOnly) q.set('activeOnly', 'true');
      const qs = q.toString();
      return request<PaymentMethodDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/payment-methods${qs ? `?${qs}` : ''}`,
      );
    },
    createPaymentMethod: (
      organizationId: string,
      storeId: string,
      body: {
        code: string;
        name: string;
        type: string;
        requiresExternalConfirmation?: boolean;
        sortOrder?: number;
      },
    ) =>
      request<PaymentMethodDto>(
        `/organizations/${organizationId}/stores/${storeId}/payment-methods`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    archivePaymentMethod: (organizationId: string, storeId: string, methodId: string) =>
      request<PaymentMethodDto>(
        `/organizations/${organizationId}/stores/${storeId}/payment-methods/${methodId}/archive`,
        { method: 'POST' },
      ),
    listPayments: (
      organizationId: string,
      storeId: string,
      query?: { status?: string; type?: string },
    ) => {
      const q = new URLSearchParams();
      if (query?.status) q.set('status', query.status);
      if (query?.type) q.set('type', query.type);
      const qs = q.toString();
      return request<PaymentDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/payments${qs ? `?${qs}` : ''}`,
      );
    },
    getPayment: (organizationId: string, storeId: string, paymentId: string) =>
      request<PaymentDto>(
        `/organizations/${organizationId}/stores/${storeId}/payments/${paymentId}`,
      ),
    createPayment: (
      organizationId: string,
      storeId: string,
      body: {
        type: string;
        methodId: string;
        amount: string;
        currencyCode?: string;
        receivedAt?: string;
        comment?: string;
        externalReference?: string;
        allocations: Array<{ targetType: string; targetId: string; amount: string }>;
      },
    ) =>
      request<PaymentDto>(`/organizations/${organizationId}/stores/${storeId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    completePayment: (
      organizationId: string,
      storeId: string,
      paymentId: string,
      idempotencyKey: string,
    ) =>
      request<PaymentDto>(
        `/organizations/${organizationId}/stores/${storeId}/payments/${paymentId}/complete`,
        { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    annulPayment: (
      organizationId: string,
      storeId: string,
      paymentId: string,
      body: { reason: string },
      idempotencyKey: string,
    ) =>
      request<PaymentDto>(
        `/organizations/${organizationId}/stores/${storeId}/payments/${paymentId}/annul`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(body),
        },
      ),
    getPaymentTimeline: (organizationId: string, storeId: string, paymentId: string) =>
      request<PaymentTimelineDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/payments/${paymentId}/timeline`,
      ),
    listPaymentRefunds: (organizationId: string, storeId: string, paymentId: string) =>
      request<PaymentRefundDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/payments/${paymentId}/refunds`,
      ),
    createPaymentRefund: (
      organizationId: string,
      storeId: string,
      paymentId: string,
      body: { amount: string; reason: string; methodId: string; externalReference?: string },
    ) =>
      request<PaymentRefundDto>(
        `/organizations/${organizationId}/stores/${storeId}/payments/${paymentId}/refunds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    completeRefund: (
      organizationId: string,
      storeId: string,
      refundId: string,
      idempotencyKey: string,
    ) =>
      request<PaymentRefundDto>(
        `/organizations/${organizationId}/stores/${storeId}/refunds/${refundId}/complete`,
        { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    annulRefund: (
      organizationId: string,
      storeId: string,
      refundId: string,
      body: { reason: string },
      idempotencyKey: string,
    ) =>
      request<PaymentRefundDto>(
        `/organizations/${organizationId}/stores/${storeId}/refunds/${refundId}/annul`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(body),
        },
      ),
    createOrderPayment: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: {
        methodId: string;
        amount: string;
        comment?: string;
        externalReference?: string;
        receivedAt?: string;
      },
    ) =>
      request<PaymentDto>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/payments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    getOrderPaymentSummary: (organizationId: string, storeId: string, orderId: string) =>
      request<PaymentSummaryDto>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/payment-summary`,
      ),
    allocateOrderPrepaymentsToSale: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: { saleId: string },
      idempotencyKey: string,
    ) =>
      request<PaymentDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/allocate-prepayments-to-sale`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(body),
        },
      ),
    createSalePayment: (
      organizationId: string,
      storeId: string,
      saleId: string,
      body: {
        methodId: string;
        amount: string;
        comment?: string;
        externalReference?: string;
        receivedAt?: string;
      },
    ) =>
      request<PaymentDto>(
        `/organizations/${organizationId}/stores/${storeId}/sales/${saleId}/payments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    getSalePaymentSummary: (organizationId: string, storeId: string, saleId: string) =>
      request<PaymentSummaryDto>(
        `/organizations/${organizationId}/stores/${storeId}/sales/${saleId}/payment-summary`,
      ),
    ensureDefaultCashAccount: (organizationId: string, storeId: string) =>
      request<CashAccountDto>(
        `/organizations/${organizationId}/stores/${storeId}/cash-accounts/ensure-default`,
        { method: 'POST' },
      ),
    listCashAccounts: (organizationId: string, storeId: string) =>
      request<CashAccountDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/cash-accounts`,
      ),
    listCashAccountOperations: (
      organizationId: string,
      storeId: string,
      cashAccountId: string,
    ) =>
      request<CashOperationDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/cash-accounts/${cashAccountId}/operations`,
      ),

    // ─── Delivery ─────────────────────────────────────────────────────────────
    createDeliveryFromOrder: (
      organizationId: string,
      storeId: string,
      orderId: string,
      body: CreateDeliveryInput,
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/orders/${orderId}/delivery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    listDeliveries: (
      organizationId: string,
      storeId: string,
      query?: { status?: string; deliveryDate?: string; courierId?: string },
    ) => {
      const q = new URLSearchParams();
      if (query?.status) q.set('status', query.status);
      if (query?.deliveryDate) q.set('deliveryDate', query.deliveryDate);
      if (query?.courierId) q.set('courierId', query.courierId);
      const qs = q.toString();
      return request<DeliveryJobDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries${qs ? `?${qs}` : ''}`,
      );
    },
    getDelivery: (organizationId: string, storeId: string, deliveryId: string) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}`,
      ),
    planDelivery: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: PlanDeliveryInput,
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/plan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    updateDeliveryAddress: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: UpdateDeliveryAddressInput,
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/address`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    geocodeDelivery: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/geocode`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    setDeliveryCoordinates: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number; latitude: string; longitude: string },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/coordinates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    assignDeliveryCourier: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number; courierProfileId: string },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/assign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    reassignDeliveryCourier: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number; courierProfileId: string },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/reassign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    releaseDeliveryCourier: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number; reason?: string | null },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/release-courier`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    markDeliveryReadyForDispatch: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/ready-for-dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    handoverDelivery: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/handover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    startDeliveryTransit: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number },
    ) =>
      request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/start-transit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    markDeliveryDelivered: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number },
      options?: { idempotencyKey?: string },
    ) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      return request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/deliver`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      );
    },
    cancelDelivery: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: { expectedVersion: number; reason?: string | null },
      options?: { idempotencyKey?: string },
    ) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      return request<DeliveryJobDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/cancel`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      );
    },
    getDeliveryTimeline: (organizationId: string, storeId: string, deliveryId: string) =>
      request<DeliveryTimelineEventDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/timeline`,
      ),
    getDeliverySummary: (organizationId: string, storeId: string, deliveryId: string) =>
      request<DeliverySummaryDto>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/summary`,
      ),
    reportDeliveryProblem: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      body: {
        expectedVersion: number;
        type: string;
        description: string;
      },
    ) =>
      request<{ delivery: DeliveryJobDto; problem: DeliveryProblemDto }>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/problems`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    resolveDeliveryProblem: (
      organizationId: string,
      storeId: string,
      deliveryId: string,
      problemId: string,
      body: {
        expectedVersion: number;
        resolution: string;
        resolveToStatus: string;
      },
      options?: { idempotencyKey?: string },
    ) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      return request<{ delivery: DeliveryJobDto; problem: DeliveryProblemDto }>(
        `/organizations/${organizationId}/stores/${storeId}/deliveries/${deliveryId}/problems/${problemId}/resolve`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      );
    },
    listCouriers: (organizationId: string, storeId: string, query?: { status?: string }) => {
      const q = new URLSearchParams();
      if (query?.status) q.set('status', query.status);
      const qs = q.toString();
      return request<CourierProfileDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/couriers${qs ? `?${qs}` : ''}`,
      );
    },
    createCourier: (
      organizationId: string,
      storeId: string,
      body: {
        membershipId: string;
        displayNameSnapshot: string;
        phoneSnapshot?: string | null;
        vehicleType?: string | null;
        vehicleDescription?: string | null;
      },
    ) =>
      request<CourierProfileDto>(
        `/organizations/${organizationId}/stores/${storeId}/couriers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    archiveCourier: (organizationId: string, storeId: string, courierId: string) =>
      request<CourierProfileDto>(
        `/organizations/${organizationId}/stores/${storeId}/couriers/${courierId}/archive`,
        { method: 'POST' },
      ),
    listDeliveryRoutes: (
      organizationId: string,
      storeId: string,
      query?: { serviceDate?: string; status?: string },
    ) => {
      const q = new URLSearchParams();
      if (query?.serviceDate) q.set('serviceDate', query.serviceDate);
      if (query?.status) q.set('status', query.status);
      const qs = q.toString();
      return request<DeliveryRoutePlanDto[]>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes${qs ? `?${qs}` : ''}`,
      );
    },
    getDeliveryRoute: (organizationId: string, storeId: string, routeId: string) =>
      request<DeliveryRoutePlanDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes/${routeId}`,
      ),
    createDeliveryRoute: (
      organizationId: string,
      storeId: string,
      body: { serviceDate: string; name: string; courierProfileId?: string | null },
    ) =>
      request<DeliveryRoutePlanDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    addDeliveryRouteStops: (
      organizationId: string,
      storeId: string,
      routeId: string,
      body: { expectedVersion: number; deliveryJobIds: string[] },
    ) =>
      request<DeliveryRoutePlanDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes/${routeId}/stops`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    reorderDeliveryRouteStops: (
      organizationId: string,
      storeId: string,
      routeId: string,
      body: { expectedVersion: number; orderedDeliveryJobIds: string[] },
    ) =>
      request<DeliveryRoutePlanDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes/${routeId}/reorder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    activateDeliveryRoute: (
      organizationId: string,
      storeId: string,
      routeId: string,
      body: { expectedVersion: number },
    ) =>
      request<DeliveryRoutePlanDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes/${routeId}/activate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    completeDeliveryRoute: (
      organizationId: string,
      storeId: string,
      routeId: string,
      body: { expectedVersion: number },
    ) =>
      request<DeliveryRoutePlanDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes/${routeId}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    cancelDeliveryRoute: (
      organizationId: string,
      storeId: string,
      routeId: string,
      body: { expectedVersion: number },
    ) =>
      request<DeliveryRoutePlanDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-routes/${routeId}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    getDeliveryBoard: (organizationId: string, storeId: string, date?: string) => {
      const q = date ? `?date=${encodeURIComponent(date)}` : '';
      return request<DeliveryBoardDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-board${q}`,
      );
    },
    getDeliveryMap: (organizationId: string, storeId: string, date?: string) => {
      const q = date ? `?date=${encodeURIComponent(date)}` : '';
      return request<DeliveryMapDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-map${q}`,
      );
    },
    getDeliveryCalendar: (organizationId: string, storeId: string, date?: string) => {
      const q = date ? `?date=${encodeURIComponent(date)}` : '';
      return request<DeliveryCalendarDto>(
        `/organizations/${organizationId}/stores/${storeId}/delivery-calendar${q}`,
      );
    },
  };
}

type SaleDiscountInput = {
  type: string;
  value: string;
  reason: string;
  comment?: string;
};

type SaleDto = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string | null;
  number: string;
  type: string;
  status: string;
  salesChannel: string;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  costAmount?: string | null;
  grossProfitAmount?: string | null;
  marginPercent?: string | null;
  currencyCode: string;
  comment: string | null;
  completedAt: string | null;
  annulledAt: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    itemId: string | null;
    descriptionSnapshot: string;
    quantity: string;
    unitPrice: string;
    grossAmount: string;
    discountAmount: string;
    netAmount: string;
    sortOrder: number;
  }>;
  discount: {
    id: string;
    type: string;
    value: string;
    reason: string;
    comment: string | null;
    approvedByMembershipId: string | null;
  } | null;
  consumption?: {
    id: string;
    sourceType: string;
    lines: Array<{
      id: string;
      itemId: string;
      requestedQuantity: string;
      issuedQuantity: string;
      costAmount?: string;
    }>;
  } | null;
  annulment: {
    id: string;
    reason: string;
    actorMembershipId: string | null;
    createdAt: string;
  } | null;
};

type PaymentMethodDto = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  requiresExternalConfirmation: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type PaymentDto = {
  id: string;
  organizationId: string;
  storeId: string;
  number: string;
  type: string;
  status: string;
  direction: string;
  methodId: string;
  amount: string;
  currencyCode: string;
  receivedAt: string;
  comment: string | null;
  externalReference: string | null;
  createdByMembershipId: string | null;
  completedAt: string | null;
  annulledAt: string | null;
  annulReason: string | null;
  createdAt: string;
  updatedAt: string;
  allocations: Array<{
    id: string;
    targetType: string;
    targetId: string;
    amount: string;
    isActive: boolean;
  }>;
};

type PaymentRefundDto = {
  id: string;
  organizationId: string;
  storeId: string;
  originalPaymentId: string;
  amount: string;
  reason: string;
  status: string;
  methodId: string;
  externalReference: string | null;
  completedAt: string | null;
  annulledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentTimelineDto = {
  id: string;
  type: string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: string;
  createdAt: string;
};

type PaymentSummaryDto = {
  targetType?: string;
  targetId?: string;
  totalAmount: string;
  paidAmount: string;
  refundedAmount: string;
  balanceDue: string;
  status: string;
};

type CashAccountDto = {
  id: string;
  organizationId: string;
  storeId: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type CashOperationDto = {
  id: string;
  cashAccountId: string;
  paymentId: string | null;
  refundId: string | null;
  type: string;
  direction: string;
  amount: string;
  occurredAt: string;
  comment: string | null;
  createdAt: string;
};

export type CompositionReplaceReason =
  | 'OUT_OF_STOCK'
  | 'QUALITY'
  | 'CUSTOMER_REQUEST'
  | 'FLORIST_DECISION'
  | 'OTHER';

export type WorkspaceFilter =
  | 'overdue'
  | 'soon'
  | 'unassigned'
  | 'in_preparation'
  | 'ready'
  | 'today'
  | 'partially_reserved'
  | 'all_open';

export type UrgencyLevel = 'NORMAL' | 'SOON' | 'URGENT' | 'OVERDUE';

export type WorkspacePrimaryAction =
  | 'CLAIM'
  | 'START_PREPARATION'
  | 'EDIT_ACTUAL'
  | 'MARK_READY'
  | 'CREATE_SALE'
  | 'VIEW'
  | 'NONE';

export type WorkspaceOrderCardDto = {
  id: string;
  number: string;
  status: string;
  readyAt: string | null;
  type: string;
  occasion: string;
  customerNameSnapshot: string | null;
  assignedFloristId: string | null;
  hasActiveAssignment: boolean;
  hasDeficit: boolean;
  version: number;
  urgency: UrgencyLevel;
  primaryAction: WorkspacePrimaryAction;
  priority: number;
};

export type WorkspaceCounterDto = {
  count: number;
  filterLink: WorkspaceFilter;
};

export type AttentionItemDto = {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  code: string;
  title: string;
  reason: string;
  entityType: string;
  entityId: string;
  recommendedAction: string;
  filterLink: string | null;
  ageMinutes: number;
};

export type LowStockWarningDto = {
  itemId: string;
  itemName: string;
  itemCode: string;
  warehouseId: string;
  availableQuantity: string;
  threshold: string;
};

export type WorkspaceTodayDto = {
  serverNow: string;
  sectionLimit: number;
  counters: {
    overdue: WorkspaceCounterDto;
    soon: WorkspaceCounterDto;
    unassigned: WorkspaceCounterDto;
    inPreparation: WorkspaceCounterDto;
    ready: WorkspaceCounterDto;
    today: WorkspaceCounterDto;
    partiallyReserved: WorkspaceCounterDto;
  };
  sections: {
    overdue: WorkspaceOrderCardDto[];
    soon: WorkspaceOrderCardDto[];
    unassigned: WorkspaceOrderCardDto[];
    inPreparation: WorkspaceOrderCardDto[];
    ready: WorkspaceOrderCardDto[];
  };
  attentionItems: AttentionItemDto[];
  lowStockWarnings: LowStockWarningDto[];
  quickActions: Array<{ code: string; label: string; requires: string }>;
};

export type WorkspaceOrdersListDto = {
  serverNow: string;
  filter: WorkspaceFilter;
  offset: number;
  limit: number;
  total: number;
  items: WorkspaceOrderCardDto[];
};

export type PlannedLineDto = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  plannedQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  deficitQuantity: string;
};

export type ActualLineDto = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  actualQuantity: string;
  batchId: string | null;
  comment: string | null;
};

export type WorkOrderPaymentSummaryDto = {
  plannedPrice: string | null;
  allocatedToOrder: string;
  saleId: string | null;
  saleStatus: string | null;
  saleNetAmount: string | null;
  allocatedToSale: string;
};

export type WorkOrderDto = {
  serverNow: string;
  version: number;
  order: WorkspaceOrderCardDto;
  plannedLines: PlannedLineDto[];
  actualLines: ActualLineDto[];
  paymentSummary: WorkOrderPaymentSummaryDto;
  primaryAction: WorkspacePrimaryAction;
  urgency: UrgencyLevel;
};

export type OperationalKpisDto = {
  ordersToday: number;
  inProgress: number;
  ready: number;
  overdue: number;
  salesToday: number;
  unpaidBalance: string;
  shortages: number;
  suppliesAwaitingReceipt: number;
};

export type OperationsBoardDto = {
  serverNow: string;
  kpis: OperationalKpisDto;
  attentionItems: AttentionItemDto[];
};

export type OperationalStockRowDto = {
  itemId: string;
  itemName: string;
  itemCode: string;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  unitCost: string | null;
};

export type OperationalStockDto = {
  serverNow: string;
  costRedacted: boolean;
  items: OperationalStockRowDto[];
};

export type WriteOffReason =
  | 'WILTED'
  | 'BROKEN'
  | 'DAMAGED'
  | 'EXPIRED'
  | 'QUALITY_ISSUE'
  | 'THEFT'
  | 'INTERNAL_USE'
  | 'OTHER';

export type WriteOffItemDto = {
  id: string;
  itemId: string;
  quantity: string;
  unitCostSnapshot?: string | null;
  costAmountSnapshot?: string | null;
};

export type WriteOffDto = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  number: string;
  status: string;
  reason: WriteOffReason;
  comment: string | null;
  version: number;
  postedAt: string | null;
  reversedAt: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  items: WriteOffItemDto[];
};

export type InventoryCountItemDto = {
  id: string;
  itemId: string;
  expectedQuantity: string;
  countedQuantity: string | null;
  varianceQuantity: string | null;
};

export type InventoryCountDto = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  number: string;
  status: string;
  version: number;
  countedAt: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  comment: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  items: InventoryCountItemDto[];
};

export type TransferAllocationDto = {
  id: string;
  transferItemId: string;
  fromItemId: string;
  batchId: string;
  quantityDispatched: string;
  quantityReceived: string | null;
  quantityDamaged: string | null;
  unitCost: string;
  toItemId: string | null;
};

export type TransferItemDto = {
  id: string;
  itemId: string;
  requestedQuantity: string;
  dispatchedQuantity: string | null;
  receivedQuantity: string | null;
  damagedQuantity: string | null;
};

export type TransferDto = {
  id: string;
  organizationId: string;
  storeId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  number: string;
  status: string;
  version: number;
  dispatchedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  reversedAt: string | null;
  comment: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  items: TransferItemDto[];
  allocations: TransferAllocationDto[];
};

export type TransferTimelineDto = {
  id: string;
  transferDocumentId: string;
  type: string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: string;
  createdAt: string;
};

export type InventoryOpsAttentionDto = {
  code: string;
  title: string;
  count: number;
};

export type InventoryTransitDto = {
  transferId: string;
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  dispatchedAt: string | null;
  totalDispatchedQuantity: string;
  totalReceivedQuantity: string;
  totalDamagedQuantity: string;
};

export type InventoryLossDto = {
  documentType: 'WRITE_OFF' | 'TRANSFER_DAMAGE';
  documentId: string;
  itemId: string;
  quantity: string;
  costAmount: string | null;
};

export type InventoryCountProgressDto = {
  inventoryCountId: string;
  number: string;
  status: string;
  countedItems: number;
  totalItems: number;
  varianceItems: number;
  version: number;
  updatedAt: string;
};

export type DeliveryJobDto = {
  id: string;
  organizationId: string;
  storeId: string;
  orderId: string;
  number: string;
  status: string;
  method: string;
  deliveryDate: string;
  windowStart: string;
  windowEnd: string;
  requiredDispatchAt: string | null;
  recipientName: string;
  recipientPhone: string;
  displayAddress: string;
  addressLine: string;
  city: string;
  postalCode: string | null;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  accessCode: string | null;
  deliveryComment: string | null;
  latitude: string | null;
  longitude: string | null;
  geocodingStatus: string;
  addressSource: string | null;
  deliveryFee: string;
  currencyCode: string;
  assignedCourierId: string | null;
  externalReference: string | null;
  providerName: string | null;
  handedOverAt: string | null;
  departedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  version: number;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryBoardCardDto = DeliveryJobDto & {
  orderNumber: string | null;
  orderStatus: string | null;
  orderReady: boolean;
  urgency: string;
};

export type DeliveryBoardDto = {
  date: string;
  sections: {
    needsPlanning: DeliveryBoardCardDto[];
    withoutCourier: DeliveryBoardCardDto[];
    orderPreparing: DeliveryBoardCardDto[];
    readyForDispatch: DeliveryBoardCardDto[];
    assigned: DeliveryBoardCardDto[];
    inTransit: DeliveryBoardCardDto[];
    problems: DeliveryBoardCardDto[];
    delivered: DeliveryBoardCardDto[];
  };
};

export type DeliveryMapPointDto = {
  deliveryId: string;
  orderId: string;
  latitude: string | null;
  longitude: string | null;
  displayAddress: string;
  status: string;
  urgency: string;
  windowStart: string;
  windowEnd: string;
  courierId: string | null;
  orderReady: boolean;
  navigationUrl: string | null;
};

export type DeliveryMapDto = {
  date: string;
  points: DeliveryMapPointDto[];
  needsAddressClarification: DeliveryMapPointDto[];
};

export type DeliveryCalendarDto = {
  date: string;
  hours: Array<{ hour: string; deliveries: DeliveryBoardCardDto[] }>;
};

export type DeliveryTimelineEventDto = {
  id: string;
  organizationId: string;
  deliveryJobId: string;
  type: string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: string;
  createdAt: string;
};

export type DeliveryProblemDto = {
  id: string;
  organizationId: string;
  deliveryJobId: string;
  type: string;
  description: string;
  status: string;
  reportedByMembershipId: string | null;
  reportedAt: string;
  resolvedByMembershipId: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  resolveToStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryPaymentSummaryDto = {
  orderTotal: string;
  paidAmount: string;
  refundedAmount: string;
  balanceDue: string;
  paymentStatus: string;
};

export type DeliverySummaryDto = {
  delivery: DeliveryJobDto;
  orderNumber: string | null;
  orderStatus: string | null;
  orderReady: boolean;
  urgency: string;
  payment: DeliveryPaymentSummaryDto | null;
  navigationUrl: string | null;
};

export type CourierProfileDto = {
  id: string;
  organizationId: string;
  membershipId: string;
  displayNameSnapshot: string;
  phoneSnapshot: string | null;
  status: string;
  vehicleType: string | null;
  vehicleDescription: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryRouteStopDto = {
  id: string;
  organizationId: string;
  routePlanId: string;
  deliveryJobId: string;
  sequence: number;
  plannedArrivalAt: string | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DeliveryRoutePlanDto = {
  id: string;
  organizationId: string;
  storeId: string;
  serviceDate: string;
  courierProfileId: string | null;
  name: string;
  status: string;
  version: number;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  stops: DeliveryRouteStopDto[];
};

export type CreateDeliveryInput = {
  method: string;
  deliveryDate: string;
  windowStart: string;
  windowEnd: string;
  requiredDispatchAt?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  addressLine: string;
  city: string;
  postalCode?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartment?: string | null;
  accessCode?: string | null;
  deliveryComment?: string | null;
  deliveryFee?: string;
  externalReference?: string | null;
  providerName?: string | null;
};

export type PlanDeliveryInput = {
  expectedVersion: number;
  deliveryDate?: string;
  windowStart?: string;
  windowEnd?: string;
  requiredDispatchAt?: string | null;
  method?: string;
  deliveryFee?: string;
  externalReference?: string | null;
  providerName?: string | null;
};

export type UpdateDeliveryAddressInput = {
  expectedVersion: number;
  addressLine: string;
  city: string;
  postalCode?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartment?: string | null;
  accessCode?: string | null;
  deliveryComment?: string | null;
  recipientName?: string;
  recipientPhone?: string;
};

export type ApiClient = ReturnType<typeof createApiClient>;
