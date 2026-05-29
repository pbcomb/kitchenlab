import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function CreateRecipe() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', content_md: '', is_public: true });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/recipes', form);
      navigate(`/recipe/${res.data.repo.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create recipe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>New Recipe</h1>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="form-group">
          <label>Title *</label>
          <input
            className="form-input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            placeholder="e.g., Homemade Pizza"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-input form-textarea"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of your recipe"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Recipe Content (Markdown)</label>
          <textarea
            className="form-input form-textarea"
            value={form.content_md}
            onChange={(e) => setForm({ ...form, content_md: e.target.value })}
            placeholder={`## Ingredients\n\n- 2 cups flour\n- 1 cup water\n\n## Instructions\n\n1. Mix ingredients\n2. Bake at 350°F`}
            rows={15}
            style={{ fontFamily: 'monospace', fontSize: 14 }}
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
            />
            Public recipe (visible to everyone)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? 'Creating...' : 'Create Recipe'}
          </button>
          <button type="button" className="btn btn-lg" onClick={() => navigate('/')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}