import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function PullRequests() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pullRequests, setPullRequests] = useState([]);
  const [branches, setBranches] = useState([]);
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ source_branch_name: '', target_branch_name: '', title: '', description: '' });
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [repoRes, prRes, branchRes] = await Promise.all([
        api.get(`/recipes/${id}`),
        api.get(`/recipes/${id}/pull-requests`),
        api.get(`/recipes/${id}/branches`),
      ]);
      setRepo(repoRes.data.repo);
      setPullRequests(prRes.data.pullRequests);
      setBranches(branchRes.data.branches);
    } catch (err) {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleCreatePR = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/recipes/${id}/pull-requests`, form);
      setShowCreate(false);
      setForm({ source_branch_name: '', target_branch_name: '', title: '', description: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create PR');
    }
  };

  const handleMerge = async (prId) => {
    if (!confirm('Merge this pull request?')) return;
    try {
      await api.post(`/recipes/pull-requests/${prId}/merge`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to merge');
    }
  };

  const handleClose = async (prId) => {
    if (!confirm('Close this pull request?')) return;
    try {
      await api.post(`/recipes/pull-requests/${prId}/close`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close');
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  const isOwner = user && repo && user.id === repo.author_id;
  const formatDate = (d) => new Date(d).toLocaleDateString();

  return (
    <div className="pr-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>Pull Requests</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/recipe/${id}`); }}>{repo?.title}</a>
          </p>
        </div>
        {user && (
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : '+ New Pull Request'}
          </button>
        )}
      </div>

      {/* Create PR form */}
      {showCreate && (
        <form onSubmit={handleCreatePR} style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 24
        }}>
          {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="form-group">
            <label>Title *</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea className="form-input form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Source Branch</label>
              <select className="form-input" value={form.source_branch_name} onChange={(e) => setForm({ ...form, source_branch_name: e.target.value })} required>
                <option value="">Select branch...</option>
                {branches.filter(b => b.name !== form.target_branch_name).map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Target Branch</label>
              <select className="form-input" value={form.target_branch_name} onChange={(e) => setForm({ ...form, target_branch_name: e.target.value })} required>
                <option value="">Select branch...</option>
                {branches.filter(b => b.name !== form.source_branch_name).map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary">Create Pull Request</button>
        </form>
      )}

      {/* PR list */}
      <div className="pr-list">
        {pullRequests.length === 0 ? (
          <div className="empty-state">
            <h2>No pull requests</h2>
            <p>Create one to propose changes to this recipe</p>
          </div>
        ) : (
          pullRequests.map(pr => (
            <div key={pr.id} className="pr-item">
              <div className="pr-info">
                <h3>{pr.title}</h3>
                <p>
                  {pr.author_name} wants to merge {pr.source_branch_name} into {pr.target_branch_name}
                  {' · '}Created {formatDate(pr.created_at)}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`pr-status ${pr.status}`}>{pr.status}</span>
                {pr.status === 'open' && isOwner && (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={() => handleMerge(pr.id)}>Merge</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleClose(pr.id)}>Close</button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}