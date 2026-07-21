-- CreateTable
CREATE TABLE "_system_bootstrap" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_system_bootstrap_pkey" PRIMARY KEY ("id")
);
