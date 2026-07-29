-- Stage C: remove unused enum values (safe only when no rows reference them)
-- Migration aborts if GIFT_CERTIFICATE or TELEGRAM rows exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_methods WHERE type = 'GIFT_CERTIFICATE') THEN
    RAISE EXCEPTION 'DEFERRED: payment_methods contain GIFT_CERTIFICATE rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM payments p
    JOIN payment_methods pm ON pm.id = p.method_id
    WHERE pm.type = 'GIFT_CERTIFICATE'
  ) THEN
    RAISE EXCEPTION 'DEFERRED: payments reference GIFT_CERTIFICATE methods';
  END IF;
  IF EXISTS (SELECT 1 FROM sales WHERE sales_channel = 'TELEGRAM') THEN
    RAISE EXCEPTION 'DEFERRED: sales contain TELEGRAM channel rows';
  END IF;
END $$;

-- PaymentMethodType: remove GIFT_CERTIFICATE
CREATE TYPE "PaymentMethodType_new" AS ENUM (
  'CASH',
  'BANK_CARD',
  'ONLINE',
  'QR',
  'BANK_TRANSFER',
  'OTHER'
);

ALTER TABLE "payment_methods"
  ALTER COLUMN "type" TYPE "PaymentMethodType_new"
  USING ("type"::text::"PaymentMethodType_new");

DROP TYPE "PaymentMethodType";
ALTER TYPE "PaymentMethodType_new" RENAME TO "PaymentMethodType";

-- SalesChannel: remove TELEGRAM
CREATE TYPE "SalesChannel_new" AS ENUM (
  'STORE',
  'PHONE',
  'WEBSITE',
  'OTHER'
);

ALTER TABLE "sales"
  ALTER COLUMN "sales_channel" TYPE "SalesChannel_new"
  USING ("sales_channel"::text::"SalesChannel_new");

DROP TYPE "SalesChannel";
ALTER TYPE "SalesChannel_new" RENAME TO "SalesChannel";
