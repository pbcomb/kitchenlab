import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function RecipeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [repo, setRepo] = useState(null);
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get(`/recipes/${id}`);
      setRepo(res.data.repo);
      setBranches(res.data.branches);
      setLikeCount(res.data.repo.like_count);
      setLiked(res.data.repo.liked_by_me || false);

      // Set active branch to default branch
      const defaultBranch = res.data.branches.find(b => b.name === res.data.repo.default_branch_name);
      setActiveBranch(defaultBranch || res.data.branches[0]);

      // Fetch comments
      const commentsRes = await api.get(`/recipes/${id}/comments`);
      setComments(commentsRes.data.comments);
    } catch (err) {
      setError('Recipe not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleFork = async () => {
    if (!user) return navigate('/login');
    try {
      const res = await api.post(`/recipes/${id}/fork`);
      navigate(`/recipe/${res.data.repo.id}`);
    } catch (err) {
      if (err.response?.data?.repo_id) {
        navigate(`/recipe/${err.response.data.repo_id}`);
      } else {
        alert(err.response?.data?.error || 'Failed to fork');
      }
    }
  };

  const handleLike = async () => {
    if (!user) return navigate('/login');
    try {
      const res = await api.post(`/recipes/${id}/like`);
      setLiked(res.data.liked);
      setLikeCount(res.data.like_count);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      const res = await api.post(`/recipes/${id}/comments`, { body: commentText });
      setComments([...comments, { ...res.data.comment, username: user.username }]);
      setCommentText('');
    } catch (err) {
      console.error(err);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleSwitchBranch = async (branchName) => {
    const branch = branches.find(b => b.name === branchName);
    if (branch) setActiveBranch(branch);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this recipe permanently?')) return;
    try {
      await api.delete(`/recipes/${id}`);
      navigate('/');
    } catch (err) {
      alert('Failed to delete');
    }
  };

  if (loading) return <div className="loading">Loading recipe...</div>;
  if (error) return <div className="empty-state"><h2>{error}</h2></div>;
  if (!repo) return null;

  const isOwner = user && user.id === repo.author_id;
  const formatDate = (d) => new Date(d).toLocaleDateString();

  // Render markdown-like content as simple HTML
  const renderContent = (md) => {
    if (!md) return '<p>No content yet</p>';
    let html = md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul><ul>/g, '');
    return '<p>' + html + '</p>';
  };

  return (
    <div>
      {/* Header */}
      <div className="recipe-header">
        <h1>{repo.title}</h1>
        <div className="recipe-meta">
          <span className="author">
            by <Link to={`/user/${repo.author_name}`}>{repo.author_name}</Link>
          </span>
          {repo.forked_from_id && (
            <span>forked from <Link to={`/recipe/${repo.forked_from_id}`}>original</Link></span>
          )}
          <span>⭐ {likeCount}</span>
          <span>⑂ {repo.fork_count}</span>
          <span>Created {formatDate(repo.created_at)}</span>
          {repo.open_pr_count > 0 && (
            <Link to={`/recipe/${id}/pull-requests`}>{repo.open_pr_count} open PR{repo.open_pr_count > 1 ? 's' : ''}</Link>
          )}
        </div>
        {repo.description && <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>{repo.description}</p>}

        {/* Action buttons */}
        <div className="recipe-actions">
          <button className="btn" onClick={handleFork}>⑂ Fork</button>
          <button className={`btn ${liked ? 'btn-primary' : ''}`} onClick={handleLike}>
            {liked ? '⭐ Unstar' : '☆ Star'}
          </button>
          <Link to={`/recipe/${id}/pull-requests`} className="btn">Pull Requests</Link>
          {isOwner && (
            <>
              <Link to={`/recipe/${id}/edit`} className="btn">Edit</Link>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </>
          )}
        </div>
      </div>

      {/* Branch selector */}
      {branches.length > 0 && (
        <div className="branch-list">
          {branches.map(b => (
            <button
              key={b.id}
              className={`branch-tag ${b.name === activeBranch?.name ? 'active' : ''} ${b.name === repo.default_branch_name ? 'default' : ''}`}
              onClick={() => handleSwitchBranch(b.name)}
            >
              {b.name} {b.name === repo.default_branch_name ? '(default)' : ''}
            </button>
          ))}
          {isOwner && user && (
            <button
              className="btn btn-sm"
              onClick={() => {
                const name = prompt('New branch name:');
                if (name) {
                  api.post(`/recipes/${id}/branches`, { name, source_branch: activeBranch?.name })
                    .then(() => fetchData())
                    .catch(err => alert(err.response?.data?.error || 'Failed'));
                }
              }}
            >
              + New Branch
            </button>
          )}
        </div>
      )}

      {/* Recipe content */}
      <div
        className="recipe-content"
        dangerouslySetInnerHTML={{ __html: renderContent(activeBranch?.content_md) }}
      />

      {/* Fork tree */}
      {(repo.fork_ancestors?.length > 0 || repo.fork_descendants?.length > 0) && (
        <div className="fork-tree">
          <h3>⑂ Fork Tree</h3>
          {repo.fork_ancestors.slice().reverse().map((a, i) => (
            <div key={i} className="fork-tree-node ancestor">
              <span>└─</span>
              <Link to={`/recipe/${a.id}`}>{a.title}</Link>
              <span style={{ color: 'var(--text-secondary)' }}>by {a.author_name}</span>
            </div>
          ))}
          <div className="fork-tree-node current">
            <span>└─</span>
            <span>{repo.title} <span style={{ color: 'var(--green)', fontSize: 12 }}>(current)</span></span>
          </div>
          {repo.fork_descendants.map((d, i) => (
            <div key={i} className="fork-tree-node descendant">
              <span>└─</span>
              <Link to={`/recipe/${d.id}`}>{d.title}</Link>
              <span style={{ color: 'var(--text-secondary)' }}>by {d.author_name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Comments */}
      <div className="comments-section">
        <h3>Comments ({comments.length})</h3>

        {user ? (
          <form onSubmit={handleAddComment} style={{ marginBottom: 20 }}>
            <textarea
              className="form-input form-textarea"
              style={{ minHeight: 80 }}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Leave a comment..."
              required
            />
            <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={commentLoading}>
              {commentLoading ? 'Posting...' : 'Comment'}
            </button>
          </form>
        ) : (
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            <Link to="/login">Log in</Link> to leave a comment
          </p>
        )}

        {comments.map(c => (
          <div key={c.id} className="comment">
            <div className="comment-header">
              <span className="username">{c.username}</span>
              <span>{formatDate(c.created_at)}</span>
            </div>
            <div className="comment-body">{c.body}</div>
          </div>
        ))}

        {comments.length === 0 && (
          <p style={{ color: 'var(--text-secondary)' }}>No comments yet</p>
        )}
      </div>
    </div>
  );
}