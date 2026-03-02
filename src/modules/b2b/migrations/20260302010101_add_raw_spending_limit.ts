import { Migration } from "@mikro-orm/migrations"

export class Migration20260302010101 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE IF EXISTS "employee"
      ADD COLUMN IF NOT EXISTS "raw_spending_limit" JSONB;
    `)

    this.addSql(`
      UPDATE "employee"
      SET "raw_spending_limit" = jsonb_build_object(
        'value',
        COALESCE("spending_limit", 0)::text,
        'precision',
        20
      )
      WHERE "raw_spending_limit" IS NULL;
    `)

    this.addSql(`
      ALTER TABLE IF EXISTS "employee"
      ALTER COLUMN "raw_spending_limit" SET NOT NULL;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE IF EXISTS "employee"
      DROP COLUMN IF EXISTS "raw_spending_limit";
    `)
  }
}
