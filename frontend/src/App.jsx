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
  const [status, setStatus] = useState('Listo');

  const loadPayments = async () => {
    setStatus('Cargando pagos...');
    const data = await fetchJson('/api/payments');
    setPayments(Array.isArray(data) ? data : []);
    setStatus('Pagos cargados.');
  };

  const loadSync = async () => {
    const data = await fetchJson('/api/sync');
    setSync(data);
  };

  const registerWatch = async () => {
    setStatus('Registrando watch de Gmail...');
    const result = await fetchJson('/api/watch', { method: 'POST' });
    setSync(result);
    setStatus('Watch registrado.');
  };

  const refreshPayments = async () => {
    if (!sync?.history_id) {
      setStatus('No hay history_id. Registra el watch primero.');
      return;
    }

    setStatus('Actualizando pagos...');
    await fetchJson('/api/payments/refresh', {
      method: 'POST',
      body: JSON.stringify({ history_id: sync.history_id }),
    });
    await loadPayments();
    await loadSync();
    setStatus('Actualización completa.');
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
        <h1>Administración Global</h1>
        <p>Panel de administración de pagos de Gmail.</p>
      </header>

      <section className="controls">
        <button onClick={registerWatch}>Registrar watch de Gmail</button>
        <button onClick={refreshPayments}>Actualizar pagos</button>
      </section>

      <section className="status">
        <strong>Estado:</strong> {status}
      </section>

      <section className="sync-state">
        <h2>Estado de sincronización</h2>
        <pre>{JSON.stringify(sync, null, 2)}</pre>
      </section>

      <section className="payments-list">
        <h2>Pagos</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Remitente</th>
              <th>Monto</th>
              <th>Fecha</th>
              <th>Asunto</th>
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
                <td colSpan="5">No se encontraron pagos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;
