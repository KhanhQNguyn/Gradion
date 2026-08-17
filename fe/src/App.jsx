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
    <div className="shell">
      <header className="topbar">
        <a className="topbar__brand" href={`#/${routes.list()}`}>
          Book Illustrator
        </a>
        <div className="topbar__user">
          <span className="topbar__email">{session.user.email}</span>
          <button type="button" className="btn btn--ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="shell__main">
        {route.name === 'new' && <NewProjectPage />}
        {route.name === 'project' && <ProjectDetailPage projectId={route.id} key={route.id} />}
        {route.name === 'list' && <ProjectListPage />}
      </main>
    </div>
  );
}
