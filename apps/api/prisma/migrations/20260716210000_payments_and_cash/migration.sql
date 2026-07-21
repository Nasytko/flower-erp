-- Epic 09: payments, refunds, allocations and cash ledger.
ALTER TYPE "OrderTimelineEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "SaleTimelineEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "SaleTimelineEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_STATUS_CHANGED';

CREATE TYPE "PaymentMethodType" AS ENUM ('CASH','BANK_CARD','ONLINE','QR','BANK_TRANSFER','GIFT_CERTIFICATE','OTHER');
CREATE TYPE "PaymentType" AS ENUM ('ORDER_PREPAYMENT','SALE_PAYMENT','REFUND','MANUAL_ADJUSTMENT');
CREATE TYPE "PaymentDirection" AS ENUM ('IN','OUT');
CREATE TYPE "PaymentStatus" AS ENUM ('DRAFT','COMPLETED','ANNULLED');
CREATE TYPE "PaymentAllocationTargetType" AS ENUM ('ORDER','SALE');
CREATE TYPE "PaymentRefundStatus" AS ENUM ('DRAFT','COMPLETED','ANNULLED');
CREATE TYPE "PaymentTimelineEventType" AS ENUM ('PAYMENT_CREATED','PAYMENT_COMPLETED','PAYMENT_ANNULLED','PAYMENT_ALLOCATED_TO_ORDER','PAYMENT_ALLOCATED_TO_SALE','PREPAYMENT_TRANSFERRED','REFUND_CREATED','REFUND_COMPLETED','REFUND_ANNULLED');
CREATE TYPE "CashAccountType" AS ENUM ('CASH_REGISTER','BANK','OTHER');
CREATE TYPE "CashAccountStatus" AS ENUM ('ACTIVE','ARCHIVED');
CREATE TYPE "CashOperationType" AS ENUM ('PAYMENT_RECEIPT','REFUND_PAYMENT','MANUAL_INCOME','MANUAL_EXPENSE','PAYMENT_ANNULMENT_REVERSAL');
CREATE TYPE "CashOperationDirection" AS ENUM ('IN','OUT');

CREATE TABLE "payment_methods" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "type" "PaymentMethodType" NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "requires_external_confirmation" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payments" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL, "number" TEXT NOT NULL,
  "type" "PaymentType" NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'DRAFT',
  "direction" "PaymentDirection" NOT NULL, "method_id" UUID NOT NULL, "amount" DECIMAL(19,4) NOT NULL,
  "currency_code" CHAR(3) NOT NULL DEFAULT 'BYN', "received_at" TIMESTAMP(3) NOT NULL, "comment" TEXT,
  "external_reference" TEXT, "created_by_membership_id" UUID, "completed_at" TIMESTAMP(3),
  "annulled_at" TIMESTAMP(3), "annul_reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_amount_check" CHECK ("amount" > 0)
);
CREATE TABLE "payment_allocations" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "payment_id" UUID NOT NULL,
  "target_type" "PaymentAllocationTargetType" NOT NULL, "target_id" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true, "superseded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocations_amount_check" CHECK ("amount" > 0)
);
CREATE TABLE "payment_allocation_transfers" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "payment_id" UUID NOT NULL,
  "from_allocation_id" UUID NOT NULL, "to_allocation_id" UUID NOT NULL, "amount" DECIMAL(19,4) NOT NULL,
  "from_target_type" "PaymentAllocationTargetType" NOT NULL, "from_target_id" UUID NOT NULL,
  "to_target_type" "PaymentAllocationTargetType" NOT NULL, "to_target_id" UUID NOT NULL,
  "actor_membership_id" UUID, "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "payment_allocation_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocation_transfers_amount_check" CHECK ("amount" > 0)
);
CREATE TABLE "payment_refunds" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL,
  "original_payment_id" UUID NOT NULL, "amount" DECIMAL(19,4) NOT NULL, "reason" TEXT NOT NULL,
  "status" "PaymentRefundStatus" NOT NULL DEFAULT 'DRAFT', "method_id" UUID NOT NULL,
  "external_reference" TEXT, "created_by_membership_id" UUID, "completed_at" TIMESTAMP(3),
  "annulled_at" TIMESTAMP(3), "annul_reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_refunds_amount_check" CHECK ("amount" > 0)
);
CREATE TABLE "payment_timeline_events" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "payment_id" UUID NOT NULL,
  "type" "PaymentTimelineEventType" NOT NULL, "message" TEXT, "actor_membership_id" UUID,
  "payload" JSONB, "occurred_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_timeline_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cash_accounts" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL, "name" TEXT NOT NULL,
  "type" "CashAccountType" NOT NULL, "status" "CashAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cash_operations" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL, "cash_account_id" UUID NOT NULL,
  "payment_id" UUID, "refund_id" UUID, "type" "CashOperationType" NOT NULL, "direction" "CashOperationDirection" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL, "comment" TEXT,
  "created_by_membership_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_operations_pkey" PRIMARY KEY ("id"), CONSTRAINT "cash_operations_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "payment_methods_organization_id_code_key" ON "payment_methods"("organization_id","code");
CREATE INDEX "payment_methods_organization_id_is_active_sort_order_idx" ON "payment_methods"("organization_id","is_active","sort_order");
CREATE UNIQUE INDEX "payments_organization_id_number_key" ON "payments"("organization_id","number");
CREATE INDEX "payments_organization_id_store_id_status_idx" ON "payments"("organization_id","store_id","status");
CREATE INDEX "payments_organization_id_store_id_received_at_idx" ON "payments"("organization_id","store_id","received_at");
CREATE INDEX "payments_method_id_idx" ON "payments"("method_id");
CREATE INDEX "payment_allocations_organization_id_payment_id_idx" ON "payment_allocations"("organization_id","payment_id");
CREATE INDEX "payment_allocations_organization_id_target_type_target_id_is_active_idx" ON "payment_allocations"("organization_id","target_type","target_id","is_active");
CREATE INDEX "payment_allocation_transfers_organization_id_payment_id_idx" ON "payment_allocation_transfers"("organization_id","payment_id");
CREATE INDEX "payment_allocation_transfers_from_target_type_from_target_id_idx" ON "payment_allocation_transfers"("from_target_type","from_target_id");
CREATE INDEX "payment_allocation_transfers_to_target_type_to_target_id_idx" ON "payment_allocation_transfers"("to_target_type","to_target_id");
CREATE INDEX "payment_refunds_organization_id_store_id_status_idx" ON "payment_refunds"("organization_id","store_id","status");
CREATE INDEX "payment_refunds_original_payment_id_status_idx" ON "payment_refunds"("original_payment_id","status");
CREATE INDEX "payment_timeline_events_organization_id_idx" ON "payment_timeline_events"("organization_id");
CREATE INDEX "payment_timeline_events_payment_id_occurred_at_idx" ON "payment_timeline_events"("payment_id","occurred_at");
CREATE INDEX "cash_accounts_organization_id_store_id_status_idx" ON "cash_accounts"("organization_id","store_id","status");
CREATE INDEX "cash_operations_organization_id_store_id_occurred_at_idx" ON "cash_operations"("organization_id","store_id","occurred_at");
CREATE INDEX "cash_operations_cash_account_id_occurred_at_idx" ON "cash_operations"("cash_account_id","occurred_at");
CREATE INDEX "cash_operations_payment_id_idx" ON "cash_operations"("payment_id");
CREATE INDEX "cash_operations_refund_id_idx" ON "cash_operations"("refund_id");

ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocation_transfers" ADD CONSTRAINT "payment_allocation_transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocation_transfers" ADD CONSTRAINT "payment_allocation_transfers_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocation_transfers" ADD CONSTRAINT "payment_allocation_transfers_from_allocation_id_fkey" FOREIGN KEY ("from_allocation_id") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocation_transfers" ADD CONSTRAINT "payment_allocation_transfers_to_allocation_id_fkey" FOREIGN KEY ("to_allocation_id") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_original_payment_id_fkey" FOREIGN KEY ("original_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_timeline_events" ADD CONSTRAINT "payment_timeline_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_timeline_events" ADD CONSTRAINT "payment_timeline_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "payment_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), p.code, p.description
FROM (VALUES
 ('payments:read','View payments, refunds, and payment history'), ('payments:create','Create draft payments and allocations'),
 ('payments:complete','Complete payments'), ('payments:annul','Annul completed payments'),
 ('payments:refund','Create, complete, and annul refunds'), ('payments:manage-methods','Manage payment methods'),
 ('payments:view-cash','View cash accounts and operations'), ('payments:manual-adjustment','Create manual cash adjustments')
) AS p(code, description) ON CONFLICT ("code") DO NOTHING;
