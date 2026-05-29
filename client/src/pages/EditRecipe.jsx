import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function EditRecipe() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', is_public: true, default_branch_id: null });
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return navigate('/login');
    api.get(`/recipes/${id}`)
      .then(res => {
        const repo = res.data.repo;
        if (repo.author_id !== user.id) return navigate(`/recipe/${id}`);
        setForm({
          title: repo.title,
          description: repo.description || '',
          is_public: repo.is_public,
          default_branch_id: repo.default_branch_id || null,
        });
        setBranches(res.data.branches);
      })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.put(`/recipes/${id}`, form);
      navigate(`/recipe/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBranch = async (branchName) => {
    if (!confirm(`Delete branch "${branchName}"?`)) return;
    try {
      await api.delete(`/recipes/${id}/branches/${branchName}`);
      setBranches(branches.filter(b => b.name !== branchName));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete branch');
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Edit Recipe</h1>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="form-group">
          <label>Title *</label>
          <input
            className="form-input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-input form-textarea"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Default Branch</label>
          <select
            className="form-input"
            value={form.default_branch_id || ''}
            onChange={(e) => setForm({ ...form, default_branch_id: parseInt(e.target.value) })}
          >
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
            />
            Public recipe
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" className="btn" onClick={() => navigate(`/recipe/${id}`)}>Cancel</button>
        </div>
      </form>

      {/* Branch management */}
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Branches</h2>
      {branches.map(b => (
        <div key={b.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius)', marginBottom: 8
        }}>
          <div>
            <strong>{b.name}</strong>
            {b.name === 'main' && <span style={{ color: 'var(--purple)', fontSize: 12, marginLeft: 8 }}>default</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                const content = prompt('Edit markdown content:', b.content_md);
                if (content !== null) {
                  api.put(`/recipes/${id}/branches/${b.name}`, { content_md: content })
                    .then(() => alert('Branch updated'))
                    .catch(err => alert(err.response?.data?.error || 'Failed'));
                }
              }}
            >
              Edit Content
            </button>
            {b.name !== 'main' && (
              <button className="btn btn-sm btn-danger" onClick={() => handleDeleteBranch(b.name)}>
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}