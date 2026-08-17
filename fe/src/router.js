import { useEffect, useState } from 'react';

const PROJECT_RE = /^projects\/(prj_[A-Za-z0-9]+)$/;

export function parseHash(hash = window.location.hash) {
  const path = hash.replace(/^#\/?/, '');

  if (path === 'projects/new') {
    return { name: 'new' };
  }

  const match = PROJECT_RE.exec(path);
  if (match) {
    return { name: 'project', id: match[1] };
  }

  return { name: 'list' };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

export function navigate(path) {
  window.location.hash = path;
}

export const routes = {
  list: () => 'projects',
  new: () => 'projects/new',
  project: (id) => `projects/${id}`,
};
