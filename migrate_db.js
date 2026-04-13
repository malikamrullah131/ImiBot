require('dotenv').config();
const { pool } = require('./db');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("Migrating database...");
        await client.query('ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS tsvector_content tsvector;');
        console.log("Added tsvector_content column.");
        
        await client.query(`
            UPDATE knowledge_base 
            SET tsvector_content = to_tsvector('indonesian', COALESCE(question, '') || ' ' || COALESCE(answer, '')) 
            WHERE tsvector_content IS NULL;
        `);
        console.log("Updated tsvector_content for existing rows.");
        
        // Setup trigger to auto-update tsvector
        await client.query(`
            CREATE OR REPLACE FUNCTION update_kb_tsvector() RETURNS trigger AS $$
            BEGIN
              NEW.tsvector_content := to_tsvector('indonesian', COALESCE(NEW.question, '') || ' ' || COALESCE(NEW.answer, ''));
              RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        `);
        await client.query('DROP TRIGGER IF EXISTS trg_kb_tsvector ON knowledge_base;');
        await client.query(`
            CREATE TRIGGER trg_kb_tsvector BEFORE INSERT OR UPDATE
            ON knowledge_base FOR EACH ROW EXECUTE FUNCTION update_kb_tsvector();
        `);
        console.log("Migration complete.");
    } catch(e) {
        console.error("Migration failed:", e.message);
    } finally {
        client.release();
        process.exit(0);
    }
}
migrate();
