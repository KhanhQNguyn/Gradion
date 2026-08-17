import { useState } from 'react';

import { loadSession, clearSession } from './session.js';
import { useRoute, navigate, routes } from './router.js';
import IdentityScreen from './components/IdentityScreen.jsx';
import ProjectListPage from './pages/ProjectListPage.jsx';
import NewProjectPage from './pages/NewProjectPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';

export default function App() {
  const [session, setSession] = useState(loadSession);
  const route = useRoute();

  if (!session) {
    return <IdentityScreen onSignedIn={setSession} />;
  }

  function signOut() {
    clearSession();
    setSession(null);
    navigate(routes.list());
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={`#/${routes.list()}`}>
          Book Illustrator
        </a>
        <div className="topbar-user">
          <span className="topbar-email">{session.user.email}</span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        {route.name === 'new' && <NewProjectPage />}
        {route.name === 'project' && <ProjectDetailPage projectId={route.id} key={route.id} />}
        {route.name === 'list' && <ProjectListPage />}
      </main>
    </div>
  );
}
