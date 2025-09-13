'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ContentstackAppSDK from '@contentstack/app-sdk';

interface CSAppInfo {
  stackName?: string;
  organizationName?: string;
  userEmail?: string;
  stackUid?: string;
  orgUid?: string;
}

type InitState = 'idle' | 'loading' | 'ready' | 'error';

export default function MarketplaceAppPage() {
  // Using 'any' for sdk due to incomplete/variant type definitions across UI locations.
  const [sdk, setSdk] = useState<any | null>(null);
  const [info, setInfo] = useState<CSAppInfo>({});
  const [state, setState] = useState<InitState>('idle');
  const [error, setError] = useState<string | null>(null);
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

  const init = useCallback(async () => {
    setState('loading');
    try {
  const instance: any = await ContentstackAppSDK.init();
      // Auto-resize so the iframe grows with content (safe no-op if not present)
  try { instance.frame?.startAutoResizer?.(); } catch { /* ignored */ }
      setSdk(instance);
      // Cast to any to safely access optional properties that may differ by location.
      const stack: any = instance.stack;
      const org: any = instance.organization || stack?.organization; // fallback if nested
      const user: any = instance.currentUser;
      setInfo({
        stackName: stack?.name,
        organizationName: org?.name,
        userEmail: user?.email,
        stackUid: stack?.uid,
        orgUid: org?.uid,
      });
      setState('ready');
    } catch (e: any) {
      setError(e?.message || 'Initialization failed');
      setState('error');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await init();
      } catch {/* handled in init */}
    })();
    return () => { alive = false; };
  }, [init]);

  const content = useMemo(() => {
    switch (state) {
      case 'idle':
      case 'loading':
        return <Status type="loading" message="Initializing Contentstack App…" />;
      case 'error':
        return <Status type="error" message={error || 'Unknown error'} onRetry={init} />;
      case 'ready':
        return (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>✅ App Initialized</h1>
            <p style={{ marginBottom: 16 }}>Your marketplace app iframe has successfully signaled readiness to Contentstack.</p>
            <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
              <Info label="Stack" value={info.stackName} />
              <Info label="Stack UID" value={info.stackUid} />
              <Info label="Organization" value={info.organizationName} />
              <Info label="Org UID" value={info.orgUid} />
              <Info label="User" value={info.userEmail} />
            </div>
            <hr style={{ margin: '24px 0' }} />
            <section>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Next Steps</h2>
              <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.5 }}>
                <li>Confirm this URL is set as your Installation (Full Page) URL in Developer Hub.</li>
                <li>Remove or adapt this scaffold and build your UI.</li>
                <li>Use <code>@contentstack/app-sdk</code> to read/write stack settings or interact with entries.</li>
                <li>Add <code>?debug</code> to the URL for raw SDK data (local only recommended).</li>
              </ol>
            </section>
            {debug && sdk && (
              <details style={{ marginTop: 24 }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Debug: Raw SDK snapshot</summary>
                <pre style={{ marginTop: 12, fontSize: 12, background: '#f5f5f5', padding: 12, overflow: 'auto' }}>{JSON.stringify(safeSerializeSDK(sdk), null, 2)}</pre>
              </details>
            )}
          </div>
        );
    }
  }, [state, error, info, debug, sdk, init]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.4, color: '#222' }}>
      {content}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', fontSize: 14 }}>
      <div style={{ width: 120, color: '#555' }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{value || '—'}</div>
    </div>
  );
}

function Status({ type, message, onRetry }: { type: 'loading' | 'error'; message: string; onRetry?: () => void }) {
  const color = type === 'error' ? '#b00020' : '#444';
  return (
    <div style={{ fontSize: 14, color }}>
      {message}
      {type === 'error' && onRetry && (
        <button style={{ marginLeft: 12, padding: '4px 10px', fontSize: 12 }} onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

// Avoid circular references when showing the SDK object
function safeSerializeSDK(sdk: any) {
  const {
    stack, organization, currentUser, location, app, params
    // frame intentionally omitted (contains window refs)
  } = sdk as any;
  return {
    stack, organization, currentUser, location, app, params
  };
}
