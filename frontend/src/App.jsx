import { useEffect, useState, useRef } from 'react';

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
};

function App() {
  const [payments, setPayments] = useState([]);
  const [sync, setSync] = useState(null);
  const [status, setStatus] = useState('Ready');

  const loadPayments = async () => {
    setStatus('Loading payments...');
    const data = await fetchJson('/api/payments');
    setPayments(Array.isArray(data) ? data : []);
    setStatus('Payments loaded.');
  };

  const loadSync = async () => {
    const data = await fetchJson('/api/sync');
    setSync(data);
  };

  const registerWatch = async () => {
    setStatus('Registering Gmail watch...');
    const result = await fetchJson('/api/watch', { method: 'POST' });
    setSync(result);
    setStatus('Watch registered.');
  };

  const refreshPayments = async () => {
    if (!sync?.history_id) {
      setStatus('No history_id available. Register watch first.');
      return;
    }

    setStatus('Refreshing payments...');
    await fetchJson('/api/payments/refresh', {
      method: 'POST',
      body: JSON.stringify({ history_id: sync.history_id }),
    });
    await loadPayments();
    await loadSync();
    setStatus('Refresh complete.');
  };

  useEffect(() => {
    loadPayments();
    loadSync();
  }, []);

  // Auto-refresh: poll sync state every 10s and refresh payments when history_id changes
  const lastHistoryRef = useRef(null);
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const newSync = await fetchJson('/api/sync');
        if (newSync && newSync.history_id && newSync.history_id !== lastHistoryRef.current) {
          lastHistoryRef.current = newSync.history_id;
          setSync(newSync);
          setStatus('Detected new history; refreshing payments...');
          await fetchJson('/api/payments/refresh', {
            method: 'POST',
            body: JSON.stringify({ history_id: newSync.history_id }),
          });
          await loadPayments();
          setStatus('Auto-refresh complete.');
        }
      } catch (e) {
        // ignore transient errors
      }
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="app-shell">
      <header>
        <h1>Global Admin</h1>
        <p>Gmail payment ingestion admin dashboard.</p>
      </header>

      <section className="controls">
        <button onClick={registerWatch}>Register Gmail Watch</button>
        <button onClick={refreshPayments}>Refresh Payments</button>
      </section>

      <section className="status">
        <strong>Status:</strong> {status}
      </section>

      <section className="sync-state">
        <h2>Sync State</h2>
        <pre>{JSON.stringify(sync, null, 2)}</pre>
      </section>

      <section className="payments-list">
        <h2>Payments</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Sender</th>
              <th>Amount</th>
              <th>Transaction Date</th>
              <th>Subject</th>
            </tr>
          </thead>
          <tbody>
            {payments.length > 0 ? (
              payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.email_id}</td>
                  <td>{payment.sender}</td>
                  <td>{payment.amount ?? '-'}</td>
                  <td>{payment.transaction_date ? new Date(payment.transaction_date).toLocaleString() : '-'}</td>
                  <td>{payment.subject}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">No payments found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;
