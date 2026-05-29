const express = require('express');
const { pool } = require('../server/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Browse public repos (with search)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, sort, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT r.*, u.username as author_name,
        db.name as default_branch_name,
        (SELECT COUNT(*) FROM recipe_likes WHERE repo_id = r.id) as like_count,
        (SELECT COUNT(*) FROM recipe_repos WHERE forked_from_id = r.id) as fork_count
      FROM recipe_repos r
      JOIN users u ON r.author_id = u.id
      LEFT JOIN recipe_branches db ON r.default_branch_id = db.id
      WHERE r.is_public = true
    `;
    let countQuery = `SELECT COUNT(*) FROM recipe_repos r WHERE r.is_public = true`;
    const params = [];
    const countParams = [];

    if (q) {
      query += ` AND (r.title ILIKE $1 OR r.description ILIKE $1)`;
      countQuery += ` AND (r.title ILIKE $1 OR r.description ILIKE $1)`;
      params.push(`%${q}%`);
      countParams.push(`%${q}%`);
    }

    if (sort === 'most_liked') {
      query += ` ORDER BY like_count DESC`;
    } else if (sort === 'most_forked') {
      query += ` ORDER BY fork_count DESC`;
    } else {
      query += ` ORDER BY r.created_at DESC`;
    }

    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    const total = parseInt(countResult.rows[0].count);

    if (req.user && result.rows.length > 0) {
      const repoIds = result.rows.map(r => r.id);
      const likeResult = await pool.query(
        'SELECT repo_id FROM recipe_likes WHERE user_id = $1 AND repo_id = ANY($2::int[])',
        [req.user.id, repoIds]
      );
      const likedIds = new Set(likeResult.rows.map(r => r.repo_id));
      result.rows.forEach(r => { r.liked_by_me = likedIds.has(r.id); });
    }

    res.json({
      repos: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Browse repos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single repo with branches
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.username as author_name, u.bio as author_bio, u.avatar_url as author_avatar,
        db.name as default_branch_name
      FROM recipe_repos r
      JOIN users u ON r.author_id = u.id
      LEFT JOIN recipe_branches db ON r.default_branch_id = db.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });

    const repo = result.rows[0];

    const branches = await pool.query(
      'SELECT b.*, u.username as author_name FROM recipe_branches b JOIN users u ON b.created_by = u.id WHERE b.repo_id = $1 ORDER BY b.created_at ASC',
      [repo.id]
    );

    const likeCount = await pool.query('SELECT COUNT(*) as count FROM recipe_likes WHERE repo_id = $1', [repo.id]);
    repo.like_count = parseInt(likeCount.rows[0].count);

    if (req.user) {
      const liked = await pool.query('SELECT id FROM recipe_likes WHERE user_id = $1 AND repo_id = $2', [req.user.id, repo.id]);
      repo.liked_by_me = liked.rows.length > 0;
    }

    const forkCount = await pool.query('SELECT COUNT(*) as count FROM recipe_repos WHERE forked_from_id = $1', [repo.id]);
    repo.fork_count = parseInt(forkCount.rows[0].count);

    // Fork ancestors (for fork tree visualization)
    const ancestors = [];
    let currentForkId = repo.forked_from_id;
    while (currentForkId) {
      const ancestor = await pool.query(
        'SELECT r.id, r.title, u.username as author_name, r.forked_from_id FROM recipe_repos r JOIN users u ON r.author_id = u.id WHERE r.id = $1',
        [currentForkId]
      );
      if (ancestor.rows.length === 0) break;
      ancestors.push(ancestor.rows[0]);
      currentForkId = ancestor.rows[0].forked_from_id;
    }
    repo.fork_ancestors = ancestors;

    // Fork descendants
    const descendants = await pool.query(
      'SELECT r.id, r.title, u.username as author_name FROM recipe_repos r JOIN users u ON r.author_id = u.id WHERE r.forked_from_id = $1',
      [repo.id]
    );
    repo.fork_descendants = descendants.rows;

    const openPrCount = await pool.query("SELECT COUNT(*) as count FROM pull_requests WHERE repo_id = $1 AND status = 'open'", [repo.id]);
    repo.open_pr_count = parseInt(openPrCount.rows[0].count);

    res.json({ repo, branches: branches.rows });
  } catch (err) {
    console.error('Get repo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create repo (with BEGIN/COMMIT to ensure repo + main branch are created atomically)
router.post('/', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, description, content_md, is_public } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    await client.query('BEGIN');

    const repoResult = await client.query(
      'INSERT INTO recipe_repos (title, description, author_id, is_public) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description || '', req.user.id, is_public !== false]
    );
    const repo = repoResult.rows[0];

    const branchResult = await client.query(
      'INSERT INTO recipe_branches (repo_id, name, content_md, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [repo.id, 'main', content_md || '', req.user.id]
    );
    const branch = branchResult.rows[0];

    await client.query('UPDATE recipe_repos SET default_branch_id = $1 WHERE id = $2', [branch.id, repo.id]);
    repo.default_branch_id = branch.id;

    await client.query('COMMIT');
    res.status(201).json({ repo, branch });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create repo error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Update repo
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const repo = await pool.query('SELECT * FROM recipe_repos WHERE id = $1', [req.params.id]);
    if (repo.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    if (repo.rows[0].author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const { title, description, is_public, default_branch_id } = req.body;
    const result = await pool.query(
      `UPDATE recipe_repos SET title = COALESCE($1, title), description = COALESCE($2, description),
        is_public = COALESCE($3, is_public), default_branch_id = COALESCE($4, default_branch_id),
        updated_at = NOW() WHERE id = $5 RETURNING *`,
      [title, description, is_public, default_branch_id, req.params.id]
    );
    res.json({ repo: result.rows[0] });
  } catch (err) {
    console.error('Update repo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete repo
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const repo = await pool.query('SELECT * FROM recipe_repos WHERE id = $1', [req.params.id]);
    if (repo.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    if (repo.rows[0].author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    await pool.query('DELETE FROM recipe_repos WHERE id = $1', [req.params.id]);
    res.json({ message: 'Recipe deleted' });
  } catch (err) {
    console.error('Delete repo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Fork a repo (uses BEGIN/COMMIT to atomically copy all branches)
router.post('/:id/fork', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const original = await pool.query('SELECT * FROM recipe_repos WHERE id = $1', [req.params.id]);
    if (original.rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });

    const existingFork = await pool.query(
      'SELECT id FROM recipe_repos WHERE forked_from_id = $1 AND author_id = $2',
      [req.params.id, req.user.id]
    );
    if (existingFork.rows.length > 0) {
      return res.status(409).json({ error: 'You already forked this recipe', repo_id: existingFork.rows[0].id });
    }

    await client.query('BEGIN');

    const branches = await client.query('SELECT name, content_md FROM recipe_branches WHERE repo_id = $1', [req.params.id]);

    const forkResult = await client.query(
      'INSERT INTO recipe_repos (title, description, author_id, forked_from_id, is_public) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [`Fork of ${original.rows[0].title}`, original.rows[0].description, req.user.id, req.params.id, true]
    );
    const fork = forkResult.rows[0];

    for (const branch of branches.rows) {
      const newBranch = await client.query(
        'INSERT INTO recipe_branches (repo_id, name, content_md, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [fork.id, branch.name, branch.content_md, req.user.id]
      );
      if (branch.name === 'main') {
        await client.query('UPDATE recipe_repos SET default_branch_id = $1 WHERE id = $2', [newBranch.rows[0].id, fork.id]);
      }
    }

    await client.query('COMMIT');

    const finalFork = await pool.query(`
      SELECT r.*, db.name as default_branch_name FROM recipe_repos r
      LEFT JOIN recipe_branches db ON r.default_branch_id = db.id WHERE r.id = $1
    `, [fork.id]);

    res.status(201).json({ repo: finalFork.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Fork error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// List branches
router.get('/:id/branches', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT b.*, u.username as author_name FROM recipe_branches b JOIN users u ON b.created_by = u.id WHERE b.repo_id = $1 ORDER BY b.created_at ASC',
      [req.params.id]
    );
    res.json({ branches: result.rows });
  } catch (err) {
    console.error('List branches error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get branch content
router.get('/:id/branches/:branchName', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT b.*, u.username as author_name FROM recipe_branches b JOIN users u ON b.created_by = u.id WHERE b.repo_id = $1 AND b.name = $2',
      [req.params.id, req.params.branchName]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Branch not found' });
    res.json({ branch: result.rows[0] });
  } catch (err) {
    console.error('Get branch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create branch
router.post('/:id/branches', authenticateToken, async (req, res) => {
  try {
    const { name, source_branch, content_md } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required' });

    const existing = await pool.query(
      'SELECT id FROM recipe_branches WHERE repo_id = $1 AND name = $2',
      [req.params.id, name]
    );
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Branch already exists' });

    let mdContent = content_md || '';
    if (source_branch) {
      const source = await pool.query(
        'SELECT content_md FROM recipe_branches WHERE repo_id = $1 AND name = $2',
        [req.params.id, source_branch]
      );
      if (source.rows.length > 0) mdContent = source.rows[0].content_md;
    }

    const result = await pool.query(
      'INSERT INTO recipe_branches (repo_id, name, content_md, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, name, mdContent, req.user.id]
    );
    res.status(201).json({ branch: result.rows[0] });
  } catch (err) {
    console.error('Create branch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update branch content
router.put('/:id/branches/:branchName', authenticateToken, async (req, res) => {
  try {
    const branch = await pool.query(
      'SELECT b.* FROM recipe_branches b JOIN recipe_repos r ON b.repo_id = r.id WHERE b.repo_id = $1 AND b.name = $2',
      [req.params.id, req.params.branchName]
    );
    if (branch.rows.length === 0) return res.status(404).json({ error: 'Branch not found' });

    const repo = await pool.query('SELECT author_id FROM recipe_repos WHERE id = $1', [req.params.id]);
    if (branch.rows[0].created_by !== req.user.id && repo.rows[0].author_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { content_md } = req.body;
    const result = await pool.query(
      'UPDATE recipe_branches SET content_md = $1, updated_at = NOW() WHERE repo_id = $2 AND name = $3 RETURNING *',
      [content_md, req.params.id, req.params.branchName]
    );
    res.json({ branch: result.rows[0] });
  } catch (err) {
    console.error('Update branch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete branch
router.delete('/:id/branches/:branchName', authenticateToken, async (req, res) => {
  try {
    if (req.params.branchName === 'main') return res.status(400).json({ error: 'Cannot delete main branch' });

    const branch = await pool.query(
      'SELECT b.* FROM recipe_branches b JOIN recipe_repos r ON b.repo_id = r.id WHERE b.repo_id = $1 AND b.name = $2',
      [req.params.id, req.params.branchName]
    );
    if (branch.rows.length === 0) return res.status(404).json({ error: 'Branch not found' });

    const repo = await pool.query('SELECT author_id, default_branch_id FROM recipe_repos WHERE id = $1', [req.params.id]);
    if (branch.rows[0].created_by !== req.user.id && repo.rows[0].author_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (repo.rows[0].default_branch_id === branch.rows[0].id) {
      await pool.query(
        'UPDATE recipe_repos SET default_branch_id = (SELECT id FROM recipe_branches WHERE repo_id = $1 AND name = $2 LIMIT 1) WHERE id = $3',
        [req.params.id, 'main', req.params.id]
      );
    }

    await pool.query('DELETE FROM recipe_branches WHERE repo_id = $1 AND name = $2', [req.params.id, req.params.branchName]);
    res.json({ message: 'Branch deleted' });
  } catch (err) {
    console.error('Delete branch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Pull Requests
router.get('/:id/pull-requests', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT pr.*, u.username as author_name,
        sb.name as source_branch_name, tb.name as target_branch_name
      FROM pull_requests pr
      JOIN users u ON pr.author_id = u.id
      JOIN recipe_branches sb ON pr.source_branch_id = sb.id
      JOIN recipe_branches tb ON pr.target_branch_id = tb.id
      WHERE pr.repo_id = $1
    `;
    const params = [req.params.id];
    if (status) { query += ` AND pr.status = $2`; params.push(status); }
    query += ` ORDER BY pr.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ pullRequests: result.rows });
  } catch (err) {
    console.error('List PRs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/pull-requests', authenticateToken, async (req, res) => {
  try {
    const { source_branch_name, target_branch_name, title, description } = req.body;
    if (!source_branch_name || !target_branch_name || !title) {
      return res.status(400).json({ error: 'source_branch_name, target_branch_name, and title are required' });
    }

    const sourceBranch = await pool.query('SELECT id FROM recipe_branches WHERE repo_id = $1 AND name = $2', [req.params.id, source_branch_name]);
    if (sourceBranch.rows.length === 0) return res.status(404).json({ error: 'Source branch not found' });

    const targetBranch = await pool.query('SELECT id FROM recipe_branches WHERE repo_id = $1 AND name = $2', [req.params.id, target_branch_name]);
    if (targetBranch.rows.length === 0) return res.status(404).json({ error: 'Target branch not found' });

    if (source_branch_name === target_branch_name) return res.status(400).json({ error: 'Branches must be different' });

    const result = await pool.query(
      'INSERT INTO pull_requests (repo_id, source_branch_id, target_branch_id, title, description, author_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.params.id, sourceBranch.rows[0].id, targetBranch.rows[0].id, title, description || '', req.user.id]
    );
    res.status(201).json({ pullRequest: result.rows[0] });
  } catch (err) {
    console.error('Create PR error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Merge a pull request (uses BEGIN/COMMIT to atomically apply changes + update status)
router.post('/pull-requests/:prId/merge', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const pr = await client.query(
      'SELECT pr.*, r.author_id as repo_author_id FROM pull_requests pr JOIN recipe_repos r ON pr.repo_id = r.id WHERE pr.id = $1',
      [req.params.prId]
    );
    if (pr.rows.length === 0) return res.status(404).json({ error: 'Pull request not found' });
    if (pr.rows[0].status !== 'open') return res.status(400).json({ error: 'Pull request is not open' });
    if (pr.rows[0].author_id !== req.user.id && pr.rows[0].repo_author_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await client.query('BEGIN');

    const sourceBranch = await client.query('SELECT content_md FROM recipe_branches WHERE id = $1', [pr.rows[0].source_branch_id]);
    await client.query('UPDATE recipe_branches SET content_md = $1, updated_at = NOW() WHERE id = $2',
      [sourceBranch.rows[0].content_md, pr.rows[0].target_branch_id]);
    await client.query("UPDATE pull_requests SET status = 'merged', merged_at = NOW() WHERE id = $1", [req.params.prId]);

    await client.query('COMMIT');
    res.json({ message: 'Pull request merged successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Merge PR error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/pull-requests/:prId/close', authenticateToken, async (req, res) => {
  try {
    const pr = await pool.query(
      'SELECT pr.*, r.author_id as repo_author_id FROM pull_requests pr JOIN recipe_repos r ON pr.repo_id = r.id WHERE pr.id = $1',
      [req.params.prId]
    );
    if (pr.rows.length === 0) return res.status(404).json({ error: 'Pull request not found' });
    if (pr.rows[0].author_id !== req.user.id && pr.rows[0].repo_author_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query("UPDATE pull_requests SET status = 'closed' WHERE id = $1", [req.params.prId]);
    res.json({ message: 'Pull request closed' });
  } catch (err) {
    console.error('Close PR error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle like
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const existing = await pool.query('SELECT id FROM recipe_likes WHERE user_id = $1 AND repo_id = $2', [req.user.id, req.params.id]);
    let liked;
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM recipe_likes WHERE id = $1', [existing.rows[0].id]);
      liked = false;
    } else {
      await pool.query('INSERT INTO recipe_likes (user_id, repo_id) VALUES ($1, $2)', [req.user.id, req.params.id]);
      liked = true;
    }
    const count = await pool.query('SELECT COUNT(*) as count FROM recipe_likes WHERE repo_id = $1', [req.params.id]);
    res.json({ liked, like_count: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error('Toggle like error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Comments
router.get('/:id/comments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT c.*, u.username, u.avatar_url FROM recipe_comments c JOIN users u ON c.user_id = u.id WHERE c.repo_id = $1 ORDER BY c.created_at ASC',
      [req.params.id]
    );
    res.json({ comments: result.rows });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

    const result = await pool.query(
      'INSERT INTO recipe_comments (user_id, repo_id, body) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, req.params.id, body]
    );
    const comment = result.rows[0];
    comment.username = req.user.username;
    res.status(201).json({ comment });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;