import { Migration } from "@mikro-orm/migrations"

export class Migration20260402170000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "product_localization" (
        "id" TEXT NOT NULL,
        "product_id" TEXT NOT NULL,
        "title_hu" TEXT NULL,
        "title_sk" TEXT NULL,
        "description_hu" TEXT NULL,
        "description_sk" TEXT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "product_localization_pkey" PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_localization_product_id_unique"
      ON "product_localization" ("product_id")
      WHERE deleted_at IS NULL;
    `)
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "product_localization";')
  }
}

