-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "shop" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "name" TEXT,
    "email" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "country" TEXT,
    "primaryLocale" TEXT NOT NULL DEFAULT 'en',
    "locales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adminLocale" TEXT NOT NULL DEFAULT 'en',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "isDevStore" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionId" TEXT,
    "flags" JSONB NOT NULL DEFAULT '{}',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "feedToken" TEXT,
    "debugUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedFor" TEXT,
    "countsDirty" BOOLEAN NOT NULL DEFAULT false,
    "validationId" TEXT,
    "deliveryCustomizationId" TEXT,
    "surchargeProductId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "Settings" (
    "shop" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ScheduledOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "customerFirst" TEXT,
    "method" TEXT NOT NULL,
    "date" TEXT,
    "slotId" TEXT,
    "slotLabel" TEXT,
    "locationId" TEXT,
    "zoneId" TEXT,
    "area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "items" JSONB NOT NULL DEFAULT '[]',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "limited" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledItem" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "slotId" TEXT,
    "method" TEXT NOT NULL,
    "locationId" TEXT,

    CONSTRAINT "ScheduledItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacityCount" (
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slotId" TEXT NOT NULL DEFAULT '',
    "orders" INTEGER NOT NULL DEFAULT 0,
    "items" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CapacityCount_pkey" PRIMARY KEY ("shop","key","date","slotId")
);

-- CreateTable
CREATE TABLE "ProductCount" (
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductCount_pkey" PRIMARY KEY ("shop","key","date")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestLog" (
    "shop" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestLog_pkey" PRIMARY KEY ("shop","day")
);

-- CreateTable
CREATE TABLE "ShareCode" (
    "code" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_feedToken_key" ON "Shop"("feedToken");

-- CreateIndex
CREATE INDEX "ScheduledOrder_shop_date_idx" ON "ScheduledOrder"("shop", "date");

-- CreateIndex
CREATE INDEX "ScheduledOrder_shop_createdAt_idx" ON "ScheduledOrder"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledOrder_shop_orderId_key" ON "ScheduledOrder"("shop", "orderId");

-- CreateIndex
CREATE INDEX "ScheduledItem_shop_date_idx" ON "ScheduledItem"("shop", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledItem_shop_orderId_lineId_key" ON "ScheduledItem"("shop", "orderId", "lineId");

-- CreateIndex
CREATE INDEX "CapacityCount_shop_date_idx" ON "CapacityCount"("shop", "date");

-- CreateIndex
CREATE INDEX "ProductCount_shop_date_idx" ON "ProductCount"("shop", "date");

-- CreateIndex
CREATE INDEX "ActivityLog_shop_at_idx" ON "ActivityLog"("shop", "at");

-- CreateIndex
CREATE INDEX "ShareCode_expiresAt_idx" ON "ShareCode"("expiresAt");

-- CreateIndex
CREATE INDEX "ShareCode_shop_idx" ON "ShareCode"("shop");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_shop_idx" ON "WebhookLog"("shop");

