-- Initial schema of the business-card domain: the state described by `prisma/schema.prisma`, not the
-- sequence of changes that led to it.
--
-- Every model carries a `type` column: it is the discriminant of a row, `{ id, type }`
-- (`src/common/contracts/entity.ts`). The value is spelled exactly as the Prisma client names its
-- delegate (`profile`, `socialLink`, …), so a table has one name in the schema, in the client and in
-- the code that selects it. `NOT NULL DEFAULT` is mandatory on the column: the seed builds rows from
-- the JSON Schema `data/profile.yml`, which knows nothing about this column, so the database fills it.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SocialKind" AS ENUM ('GITHUB', 'LINKEDIN', 'WEBSITE', 'OTHER');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'profile',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialLink" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'socialLink',
    "profileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "SocialKind" NOT NULL,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'skill',
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- `finished` says that the employment is over. An owner may hold several jobs at a time, so "this job
-- is over" is a fact about the row, not the absence of an end date: a current job carries `false` and
-- an empty `endedAt`, and the seed checks that the two agree before it writes a row. The column is
-- `NOT NULL DEFAULT false`, so a row written without the flag reads as a current job.
--
-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'experience',
    "profileId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "achievements" TEXT[],

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'project',
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- The lookups the API makes: the profile is upserted by `slug`, a skill is identified by `profileId`
-- plus `name`, and the employment list is filtered by the `finished` flag. Every nested collection of
-- one parent is read in the natural order of its table, so an index of a collection starts with
-- `profileId` — the filter — and continues with the leading keys of the order (`ORDER BY`:
-- `kind, label`, `category, name`, `startedAt`, `name`, latest job first for the date). The tail of
-- every order (`id`) is not part of an index: the database sorts it inside the rows of one parent.
-- CreateIndex
CREATE UNIQUE INDEX "Profile_slug_key" ON "Profile"("slug");

-- CreateIndex
CREATE INDEX "SocialLink_profileId_kind_label_idx" ON "SocialLink"("profileId", "kind", "label");

-- CreateIndex
CREATE INDEX "Skill_profileId_category_name_idx" ON "Skill"("profileId", "category", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_profileId_name_key" ON "Skill"("profileId", "name");

-- CreateIndex
CREATE INDEX "Experience_profileId_startedAt_idx" ON "Experience"("profileId", "startedAt");

-- CreateIndex
CREATE INDEX "Experience_finished_idx" ON "Experience"("finished");

-- CreateIndex
CREATE INDEX "Project_profileId_name_idx" ON "Project"("profileId", "name");

-- AddForeignKey
ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
