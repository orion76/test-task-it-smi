-- `Skill` and `SocialLink` become dictionaries: one row per value, shared by every profile that lists
-- it. The tie of a profile to a dictionary row moves into `ProfileSkill` and `ProfileSocialLink`, which
-- is why the dictionary tables lose `profileId` and gain a unique key on the value itself.
--
-- The migration is not a pure schema change: a row of the old shape carries both the value and its
-- owner, so the data is moved into the new shape before the column that holds the owner is dropped.
-- Duplicates of a value collapse into one dictionary row, and every owner keeps its tie to it. The row
-- with the smallest `id` survives, so the outcome of the migration is the same on every machine.

-- DropForeignKey
ALTER TABLE "Skill" DROP CONSTRAINT "Skill_profileId_fkey";

-- DropForeignKey
ALTER TABLE "SocialLink" DROP CONSTRAINT "SocialLink_profileId_fkey";

-- CreateTable
CREATE TABLE "ProfileSkill" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'profileSkill',
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "ProfileSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSocialLink" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'profileSocialLink',
    "profileId" TEXT NOT NULL,
    "socialLinkId" TEXT NOT NULL,

    CONSTRAINT "ProfileSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileSkill_profileId_idx" ON "ProfileSkill"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileSkill_profileId_skillId_key" ON "ProfileSkill"("profileId", "skillId");

-- CreateIndex
CREATE INDEX "ProfileSocialLink_profileId_idx" ON "ProfileSocialLink"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileSocialLink_profileId_socialLinkId_key" ON "ProfileSocialLink"("profileId", "socialLinkId");

-- DataMigration
-- Every old skill row names one owner and one value: the owner becomes a link row, the value becomes
-- a dictionary row. The links are written while the owner is still on the skill row.
WITH kept AS (
    SELECT "name", MIN("id") AS "id" FROM "Skill" GROUP BY "name"
)
INSERT INTO "ProfileSkill" ("id", "type", "profileId", "skillId")
SELECT gen_random_uuid()::text, 'profileSkill', "Skill"."profileId", kept."id"
FROM "Skill"
JOIN kept ON kept."name" = "Skill"."name";

-- The duplicate dictionary rows have no link of their own any more, so they can go.
DELETE FROM "Skill" WHERE "id" NOT IN (SELECT MIN("id") FROM "Skill" GROUP BY "name");

-- DataMigration
-- The same two steps for the links: the address identifies the dictionary row, the owner becomes a row
-- of the tie table.
WITH kept AS (
    SELECT "url", MIN("id") AS "id" FROM "SocialLink" GROUP BY "url"
)
INSERT INTO "ProfileSocialLink" ("id", "type", "profileId", "socialLinkId")
SELECT gen_random_uuid()::text, 'profileSocialLink', "SocialLink"."profileId", kept."id"
FROM "SocialLink"
JOIN kept ON kept."url" = "SocialLink"."url";

DELETE FROM "SocialLink" WHERE "id" NOT IN (SELECT MIN("id") FROM "SocialLink" GROUP BY "url");

-- DropIndex
DROP INDEX "SocialLink_profileId_kind_label_idx";

-- DropIndex
DROP INDEX "Skill_profileId_category_name_idx";

-- DropIndex
DROP INDEX "Skill_profileId_name_key";

-- AlterTable
ALTER TABLE "Skill" DROP COLUMN "profileId";

-- AlterTable
ALTER TABLE "SocialLink" DROP COLUMN "profileId";

-- CreateIndex
CREATE INDEX "Skill_category_name_idx" ON "Skill"("category", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "SocialLink_kind_label_idx" ON "SocialLink"("kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "SocialLink_url_key" ON "SocialLink"("url");

-- AddForeignKey
ALTER TABLE "ProfileSkill" ADD CONSTRAINT "ProfileSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSkill" ADD CONSTRAINT "ProfileSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSocialLink" ADD CONSTRAINT "ProfileSocialLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSocialLink" ADD CONSTRAINT "ProfileSocialLink_socialLinkId_fkey" FOREIGN KEY ("socialLinkId") REFERENCES "SocialLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
