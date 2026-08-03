-- Track supplier payment for supply documents

ALTER TABLE "supplies" ADD COLUMN "paid_at" TIMESTAMP(3);
