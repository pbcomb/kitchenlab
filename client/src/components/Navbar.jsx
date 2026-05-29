import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="brand-icon">🍳</span>
        KitchenLab
      </Link>
      <div className="navbar-links">
        <Link to="/">Explore</Link>
        {user ? (
          <>
            <Link to="/recipe/new">+ New Recipe</Link>
            <Link to={`/user/${user.username}`}>{user.username}</Link>
            <button onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register" className="nav-btn-primary">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}