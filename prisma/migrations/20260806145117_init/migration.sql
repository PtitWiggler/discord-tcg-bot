-- CreateTable
CREATE TABLE "Player" (
    "discordId" TEXT NOT NULL PRIMARY KEY,
    "lastLootAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Rarity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "colorHex" TEXT NOT NULL,
    "dropWeight" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "CardTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "flavorText" TEXT
);

-- CreateTable
CREATE TABLE "CardVariant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cardTemplateId" INTEGER NOT NULL,
    "rarityId" INTEGER NOT NULL,
    "imageFile" TEXT NOT NULL,
    CONSTRAINT "CardVariant_cardTemplateId_fkey" FOREIGN KEY ("cardTemplateId") REFERENCES "CardTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardVariant_rarityId_fkey" FOREIGN KEY ("rarityId") REFERENCES "Rarity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerCard" (
    "playerId" TEXT NOT NULL,
    "cardVariantId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "firstObtainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("playerId", "cardVariantId"),
    CONSTRAINT "PlayerCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("discordId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerCard_cardVariantId_fkey" FOREIGN KEY ("cardVariantId") REFERENCES "CardVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Rarity_name_key" ON "Rarity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CardTemplate_slug_key" ON "CardTemplate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CardVariant_cardTemplateId_rarityId_key" ON "CardVariant"("cardTemplateId", "rarityId");
