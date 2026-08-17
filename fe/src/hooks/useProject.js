import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Fast enough that portraits visibly land one at a time; slow enough to
// be idle-friendly.
const POLL_ACTIVE_MS = 1800;
const POLL_IDLE_MS = 15000;

export function useProject(projectId) {
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pendingStep, setPendingStep] = useState(null);

  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setLoadError(null);
    setActionError(null);
    setPendingStep(null);

    async function tick() {
      try {
        const fresh = await api.getProject(projectId);
        if (cancelled) return;
        setProject(fresh);
        setLoadError(null);
        const nextDelay = fresh.stepState ? POLL_ACTIVE_MS : POLL_IDLE_MS;
        timerRef.current = setTimeout(tick, nextDelay);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err);
        // A backend that just restarted should heal the view without the
        // user doing anything, so keep retrying at the idle interval.
        timerRef.current = setTimeout(tick, POLL_IDLE_MS);
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId]);

  async function refresh() {
    try {
      const fresh = await api.getProject(projectId);
      setProject(fresh);
      setLoadError(null);
      return fresh;
    } catch (err) {
      setLoadError(err);
      return null;
    }
  }

  async function runStep(step, body = {}) {
    setPendingStep(step);
    setActionError(null);
    try {
      const claimed = await api.runStep(projectId, step, body);
      setProject(claimed);
    } catch (err) {
      // Someone else — a second tab, a double-click that beat the
      // disabled button — already started this step; that's a cue to
      // show the in-flight state, not a failure.
      if (err.details?.code === 'step_in_progress' || err.status === 409) {
        await refresh();
      } else {
        setActionError(err);
      }
    } finally {
      setPendingStep(null);
    }
  }

  async function resetStuckStep() {
    try {
      const fresh = await api.resetStuckStep(projectId);
      setProject(fresh);
    } catch (err) {
      setActionError(err);
      // The claim might have resolved on its own between the click and
      // the response.
      await refresh();
    }
  }

  return { project, loadError, actionError, pendingStep, runStep, resetStuckStep, refresh };
}
