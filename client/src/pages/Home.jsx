import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';

export default function Home() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const q = searchParams.get('q') || '';
  const sort = searchParams.get('sort') || 'newest';

  useEffect(() => {
    setLoading(true);
    api.get('/recipes', { params: { q, sort } })
      .then(res => setRepos(res.data.repos))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [q, sort]);

  const updateSearch = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setSearchParams(params);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return d.toLocaleDateString();
  };

  return (
    <div>
      <div className="home-header">
        <h1>🍳 KitchenLab</h1>
        <p>Discover, fork, and remix recipes from around the world</p>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search recipes..."
          value={q}
          onChange={(e) => updateSearch('q', e.target.value)}
        />
      </div>

      <div className="sort-options">
        <button
          className={`sort-btn ${sort === 'newest' ? 'active' : ''}`}
          onClick={() => updateSearch('sort', 'newest')}
        >
          Newest
        </button>
        <button
          className={`sort-btn ${sort === 'most_liked' ? 'active' : ''}`}
          onClick={() => updateSearch('sort', 'most_liked')}
        >
          Most Liked
        </button>
        <button
          className={`sort-btn ${sort === 'most_forked' ? 'active' : ''}`}
          onClick={() => updateSearch('sort', 'most_forked')}
        >
          Most Forked
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading recipes...</div>
      ) : repos.length === 0 ? (
        <div className="empty-state">
          <h2>{q ? 'No recipes found' : 'No recipes yet'}</h2>
          <p>{q ? 'Try a different search term' : 'Be the first to create a recipe!'}</p>
        </div>
      ) : (
        <div className="recipe-grid">
          {repos.map(repo => (
            <div
              key={repo.id}
              className="recipe-card"
              onClick={() => navigate(`/recipe/${repo.id}`)}
            >
              <h3>{repo.title}</h3>
              <p>{repo.description || 'No description'}</p>
              <div className="card-footer">
                <span>by {repo.author_name}</span>
                <div className="stats">
                  <span>⭐ {repo.like_count}</span>
                  <span>⑂ {repo.fork_count}</span>
                  <span>Created {formatDate(repo.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}