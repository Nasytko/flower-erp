-- Organization-level map/geocoding settings (Yandex Maps, navigation)

CREATE TABLE "organization_integration_settings" (
  "organization_id" UUID NOT NULL,
  "geocoding_provider" TEXT NOT NULL DEFAULT 'nominatim',
  "yandex_maps_api_key" TEXT,
  "navigation_provider" TEXT NOT NULL DEFAULT 'yandex_maps',
  "map_default_latitude" TEXT,
  "map_default_longitude" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_integration_settings_pkey" PRIMARY KEY ("organization_id")
);

ALTER TABLE "organization_integration_settings"
  ADD CONSTRAINT "organization_integration_settings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
