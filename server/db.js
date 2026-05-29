const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        bio TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recipe_repos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        forked_from_id INTEGER REFERENCES recipe_repos(id) ON DELETE SET NULL,
        default_branch_id INTEGER,
        thumbnail_url TEXT DEFAULT '',
        is_public BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recipe_branches (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        content_md TEXT DEFAULT '',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(repo_id, name)
      );

      CREATE TABLE IF NOT EXISTS pull_requests (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        source_branch_id INTEGER REFERENCES recipe_branches(id) ON DELETE CASCADE,
        target_branch_id INTEGER REFERENCES recipe_branches(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')),
        author_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        merged_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS recipe_likes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        UNIQUE(user_id, repo_id)
      );

      CREATE TABLE IF NOT EXISTS recipe_comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Add default_branch_id column if it doesn't exist (for existing tables)
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'recipe_repos' AND column_name = 'default_branch_id'
        ) THEN
          ALTER TABLE recipe_repos ADD COLUMN default_branch_id INTEGER;
        END IF;
      END $$;
    `);
    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };