import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';

export default function UserProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/users/${username}`)
      .then(res => {
        setProfile(res.data.user);
        setRepos(res.data.repos);
      })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <div className="loading">Loading profile...</div>;
  if (!profile) return null;

  const formatDate = (d) => new Date(d).toLocaleDateString();

  return (
    <div>
      <div className="profile-header">
        <h1>{profile.username}</h1>
        {profile.bio && <div className="bio">{profile.bio}</div>}
        <div className="profile-stats">
          <span>📝 {repos.length} recipe{repos.length !== 1 ? 's' : ''}</span>
          <span>⭐ {profile.star_count} star{profile.star_count !== 1 ? 's' : ''}</span>
          <span>Joined {formatDate(profile.created_at)}</span>
        </div>
      </div>

      <div className="profile-tabs">
        <button className="tab-btn active">Recipes</button>
      </div>

      {repos.length === 0 ? (
        <div className="empty-state">
          <h2>No recipes yet</h2>
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
                <span>by {profile.username}</span>
                <div className="stats">
                  <span>⭐ {repo.like_count}</span>
                  <span>⑂ {repo.fork_count}</span>
                  {repo.forked_from_id && <span>forked</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}