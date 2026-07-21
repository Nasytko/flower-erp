-- Epic 08: order timeline events for sale complete / annul handoff
ALTER TYPE "OrderTimelineEventType" ADD VALUE IF NOT EXISTS 'SALE_COMPLETED';
ALTER TYPE "OrderTimelineEventType" ADD VALUE IF NOT EXISTS 'SALE_ANNULLED';
