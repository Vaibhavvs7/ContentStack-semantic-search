'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface CSAppInfo {
  stackName?: string;
  organizationName?: string;
  userEmail?: string;
  stackUid?: string;
  orgUid?: string;
  mock?: boolean;
}

type InitState = 'idle' | 'loading' | 'ready' | 'error';

export default function MarketplaceAppPage() {
  const [sdk, setSdk] = useState<any | null>(null);
  const [info, setInfo] = useState<CSAppInfo>({});
  const [state, setState] = useState<InitState>('idle');
  const [error, setError] = useState<string | null>(null);

  const qs =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const debug = !!qs?.get('debug');
  const forceMock = !!qs?.get('mock');
  const isEmbedded =
    typeof window !== 'undefined' && window.parent && window.parent !== window;

  const init = useCallback(async () => {
    setState('loading');

    // If not embedded (direct open) or ?mock present -> use mock
    if (!isEmbedded || forceMock) {
      setInfo({
        stackName: '(mock stack)',
        stackUid: 'mock_stack_uid',
        organizationName: '(mock org)',
        orgUid: 'mock_org_uid',
        userEmail: 'user@example.com',
        mock: true,
      });
      setSdk({
        mock: true,
        note: 'Running in mock mode (not inside Contentstack iframe).',
      });
      setState('ready');
      return;
    }

    try {
      const { default: ContentstackAppSDK } = await import('@contentstack/app-sdk');
      const instance: any = await ContentstackAppSDK.init();

      try {
        instance.frame?.startAutoResizer?.();
      } catch { /* ignore */ }

      setSdk(instance);

      const stack: any = instance.stack;
      const org: any = instance.organization || stack?.organization;
      const user: any = instance.currentUser;

      setInfo({
        stackName: stack?.name,
        organizationName: org?.name,
        userEmail: user?.email,
        stackUid: stack?.uid,
        orgUid: org?.uid,
        mock: false,
      });

      setState('ready');
    } catch (e: any) {
      setError(e?.message || 'Initialization failed');
      setState('error');
    }
  }, [isEmbedded, forceMock]);

  useEffect(() => {
    init();
  }, [init]);

  const content = useMemo(() => {
    switch (state) {
      case 'idle':
      case 'loading':
        return <Status type="loading" message="Initializing Contentstack App…" />;
      case 'error':
        return (
          <Status
            type="error"
            message={error || 'Unknown error'}
            onRetry={init}
          />
        );
      case 'ready':
        return (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              ✅ App Initialized {info.mock && '(Mock Mode)'}
            </h1>
            {info.mock && (
              <p style={{ margin: '4px 0 12px', color: '#aa6600', fontSize: 13 }}>
                Not running inside Contentstack iframe. Real SDK mocked. Add this app
                in Contentstack to test the true environment. (Use ?mock to force.)
              </p>
            )}
            <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
              <Info label="Stack" value={info.stackName} />
              <Info label="Stack UID" value={info.stackUid} />
              <Info label="Organization" value={info.organizationName} />
              <Info label="Org UID" value={info.orgUid} />
              <Info label="User" value={info.userEmail} />
            </div>
            <hr style={{ margin: '24px 0' }} />
            <section>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Next Steps
              </h2>
              <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.5 }}>
                <li>
                  Open via Contentstack (App Full Page) to get real SDK values.
                </li>
                <li>
                  Direct test: /marketplace?mock (forces mock), /marketplace?debug
                  (shows snapshot).
                </li>
                <li>
                  Replace scaffold with actual features once initialization confirmed.
                </li>
              </ol>
            </section>
            {debug && sdk && (
              <details style={{ marginTop: 24 }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Debug: Raw SDK snapshot
                </summary>
                <pre
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    background: '#f5f5f5',
                    padding: 12,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(safeSerializeSDK(sdk), null, 2)}
                </pre>
              </details>
            )}
          </div>
        );
    }
  }, [state, error, info, debug, sdk, init]);

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        lineHeight: 1.4,
        color: '#222',
      }}
    >
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

function Status({
  type,
  message,
  onRetry,
}: {
  type: 'loading' | 'error';
  message: string;
  onRetry?: () => void;
}) {
  const color = type === 'error' ? '#b00020' : '#444';
  return (
    <div style={{ fontSize: 14, color }}>
      {message}
      {type === 'error' && onRetry && (
        <button
          style={{ marginLeft: 12, padding: '4px 10px', fontSize: 12 }}
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function safeSerializeSDK(sdk: any) {
  const { stack, organization, currentUser, location, app, params, mock } = sdk || {};
  return { stack, organization, currentUser, location, app, params, mock };
}
