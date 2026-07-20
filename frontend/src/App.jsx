import { useEffect, useState, useRef } from 'react';
import './AppToastStyles.css';

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${text || 'empty response'}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON response from ${url}: ${text}`);
  }
};

function App() {
  const [payments, setPayments] = useState([]);
  const [parserConfig, setParserConfig] = useState(() => {
    try {
      const raw = localStorage.getItem('paymentsParserConfig');
      return raw ? JSON.parse(raw) : {
        amountRegex: "S\\/\\s?([0-9]+(?:[\\.,][0-9]{1,2})?)|([0-9]+(?:[\\.,][0-9]{2}))",
        nameRegex: "de\\s+([A-Z][^\\n\\r<]+)",
      };
    } catch (e) {
      return {
        amountRegex: "S\\/\\s?([0-9]+(?:[\\.,][0-9]{1,2})?)|([0-9]+(?:[\\.,][0-9]{2}))",
        nameRegex: "de\\s+([A-Z][^\\n\\r<]+)",
      };
    }
  });
  const [sync, setSync] = useState(null);
  const [status, setStatus] = useState('Listo');
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [allowedSendersText, setAllowedSendersText] = useState('');
  const [siteClosed, setSiteClosed] = useState(false);
  const [siteClosedUntil, setSiteClosedUntil] = useState('');
  const [siteClosedText, setSiteClosedText] = useState('Abre mañana');
  const [siteHoursStart, setSiteHoursStart] = useState('10:00');
  const [siteHoursEnd, setSiteHoursEnd] = useState('23:00');
  const [siteStatus, setSiteStatus] = useState('Abierto todos los días de 10:00 - 23:00');
  const [adminGames, setAdminGames] = useState([]);
  const [gamesQuery, setGamesQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const knownPaymentIdsRef = useRef(new Set());

  const addToast = (payment) => {
    const parsed = parseWithConfig(payment);
    const customer = payment.parsed_customer || parsed.extractedName || payment.sender || 'Cliente';
    const amountValueRaw = payment.parsed_amount ?? parsed.extractedAmount ?? payment.amount;
    const amountValue = typeof amountValueRaw === 'number'
      ? amountValueRaw
      : parseFloat(String(amountValueRaw || '').replace(/[,]/g, '.'));
    const amountText = Number.isFinite(amountValue) ? `S/ ${amountValue.toFixed(2)}` : 'Monto desconocido';
    const timeText = payment.transaction_date ? new Date(payment.transaction_date).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Hora desconocida';
    setToasts((current) => [
      {
        id: payment.email_id || `${Date.now()}-${Math.random()}`,
        customer,
        amount: amountText,
        time: timeText,
      },
      ...current,
    ]);
  };

  const dismissToast = (toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const loadPayments = async (notifyNew = false) => {
    try {
      setStatus('Cargando pagos...');
      const data = await fetchJson('/api/payments');
      const newPayments = Array.isArray(data) ? data : [];
      if (notifyNew) {
        newPayments.forEach((payment) => {
          if (!knownPaymentIdsRef.current.has(payment.email_id)) {
            addToast(payment);
          }
        });
      }
      newPayments.forEach((payment) => {
        if (payment.email_id) {
          knownPaymentIdsRef.current.add(payment.email_id);
        }
      });
      setPayments(newPayments);
      setStatus('Pagos cargados.');
    } catch (error) {
      console.error(error);
      setStatus(`Error cargando pagos: ${error.message}`);
    }
  };

  const saveParserConfig = () => {
    try {
      localStorage.setItem('paymentsParserConfig', JSON.stringify(parserConfig));
      setStatus('Configuración del parser guardada.');
    } catch (e) {
      setStatus('No se pudo guardar la configuración.');
    }
  };

  const stripHtml = (raw) => {
    if (!raw) return '';
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const parseWithConfig = (payment) => {
    const cfg = parserConfig || {};
    const text = stripHtml(payment.raw_body || '') + '\n' + (payment.subject || '');

    let extractedAmount = null;
    try {
      const amountRe = new RegExp(cfg.amountRegex, 'i');
      const m = text.match(amountRe);
      if (m) {
        // prefer capture group 1 then 2
        const found = m[1] || m[2] || m[0];
        if (found) {
          // normalize decimal comma to dot
          const cleaned = found.replace(/[,]/g, '.').replace(/[^0-9.]/g, '');
          const val = parseFloat(cleaned);
          if (!Number.isNaN(val)) extractedAmount = val;
        }
      }
    } catch (e) {
      // invalid regex, ignore
    }

    let extractedName = null;
    try {
      const nameRe = new RegExp(cfg.nameRegex, 'i');
      const m = text.match(nameRe);
      if (m) {
        extractedName = (m[1] || m[0] || '').trim();
      }
    } catch (e) {
      // ignore
    }

    return { extractedName, extractedAmount };
  };

  const loadSync = async () => {
    try {
      const data = await fetchJson('/api/sync');
      setSync(data);
      setWatchEnabled(Boolean(data?.watch_enabled));
      return data;
    } catch (error) {
      console.error(error);
      setStatus(`Error cargando sync: ${error.message}`);
      setWatchEnabled(false);
      return null;
    }
  };

  const loadAllowedSenders = async () => {
    try {
      const data = await fetchJson('/api/settings/allowed-senders');
      setAllowedSendersText(Array.isArray(data?.senders) ? data.senders.join('\n') : '');
    } catch (error) {
      console.error(error);
      setStatus(`Error cargando remitentes: ${error.message}`);
    }
  };

  const registerWatch = async () => {
    setStatus('Registrando watch de Gmail...');
    const result = await fetchJson('/api/watch/start', { method: 'POST' });
    setSync(result);
    setWatchEnabled(Boolean(result?.watch_enabled));
    setStatus('Watch activo.');
  };

  const stopWatch = async () => {
    setStatus('Deteniendo watch de Gmail...');
    const result = await fetchJson('/api/watch/stop', { method: 'POST' });
    setSync(result);
    setWatchEnabled(Boolean(result?.watch_enabled));
    setStatus('Watch detenido.');
  };

  const saveAllowedSenders = async () => {
    setStatus('Guardando remitentes permitidos...');
    const result = await fetchJson('/api/settings/allowed-senders', {
      method: 'POST',
      body: JSON.stringify({ senders: allowedSendersText.split(/\r?\n|,/) }),
    });
    setSync(result);
    setStatus('Remitentes permitidos actualizados.');
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
    await loadPayments(true);
    await loadSync();
    setStatus('Actualización completa.');
  };

  const loadSiteStatus = async () => {
    try {
      const data = await fetchJson('/api/settings/site-status');
      setSiteClosed(Boolean(data.site_closed));
      setSiteClosedUntil(data.site_closed_until || '');
      setSiteClosedText(data.site_closed_text || 'Abre mañana');
      setSiteHoursStart(data.site_hours_start || '10:00');
      setSiteHoursEnd(data.site_hours_end || '23:00');

      const hoursDisplay = data.site_hours_start && data.site_hours_end ? `${data.site_hours_start} - ${data.site_hours_end}` : data.site_hours || '10:00 - 23:00';

      // If site_closed_until is in the past, treat as not closed and fall back to schedule
      if (data.site_closed) {
        if (data.site_closed_until) {
          const until = new Date(data.site_closed_until);
          const now = new Date();
          if (until.getTime() <= now.getTime()) {
            // expired closure -> use schedule
            setSiteStatus(`Abierto todos los días de ${hoursDisplay}`);
            setSiteClosed(false);
          } else {
            setSiteStatus(`Cerrado hasta ${until.toLocaleDateString('es-PE', { day: '2-digit', month: 'long' })}`);
          }
        } else {
          setSiteStatus(data.site_closed_text || 'Abre mañana');
        }
      } else {
        setSiteStatus(`Abierto todos los días de ${hoursDisplay}`);
      }

      return data;
    } catch (error) {
      console.error(error);
      setStatus(`Error cargando estado del sitio: ${error.message}`);
      return null;
    }
  };

  // --- Games admin functions ---
  const loadAdminGames = async (q = '') => {
    try {
      const url = `/api/admin/games${q ? `?q=${encodeURIComponent(q)}` : ''}`;
      const data = await fetchJson(url);
      setAdminGames(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load admin games:', err);
      setAdminGames([]);
    }
  };

  const createOrUpdateGame = async (payload) => {
    try {
      const data = await fetchJson('/api/admin/games', { method: 'POST', body: JSON.stringify(payload) });
      await loadAdminGames(gamesQuery);
      setStatus(`Juego ${data.name} guardado.`);
      return data;
    } catch (err) {
      setStatus(`Error guardando juego: ${err.message}`);
      throw err;
    }
  };

  const deleteGame = async (id) => {
    try {
      await fetchJson(`/api/admin/games/${id}`, { method: 'DELETE' });
      await loadAdminGames(gamesQuery);
      setStatus('Juego eliminado.');
    } catch (err) {
      setStatus(`Error eliminando: ${err.message}`);
    }
  };

  const toggleGameDisabled = async (id, disabled) => {
    try {
      await fetchJson(`/api/admin/games/${id}`, { method: 'PATCH', body: JSON.stringify({ disabled }) });
      await loadAdminGames(gamesQuery);
      setStatus('Juego actualizado.');
    } catch (err) {
      setStatus(`Error actualizando juego: ${err.message}`);
    }
  };

  const saveSiteStatus = async () => {
    setStatus('Guardando estado del local...');
    const payload = {
      site_closed: siteClosed,
      site_closed_until: siteClosed ? siteClosedUntil || null : null,
      site_closed_text: siteClosed ? siteClosedText || null : null,
      site_hours_start: siteHoursStart,
      site_hours_end: siteHoursEnd,
    };
    const result = await fetchJson('/api/settings/site-status', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setSiteClosed(Boolean(result.site_closed));
    setSiteClosedUntil(result.site_closed_until || '');
    setSiteClosedText(result.site_closed_text || 'Abre mañana');
    setSiteHoursStart(result.site_hours_start || '10:00');
    setSiteHoursEnd(result.site_hours_end || '23:00');
    setStatus('Estado del local actualizado.');
    const hoursDisplay = result.site_hours_start && result.site_hours_end ? `${result.site_hours_start} - ${result.site_hours_end}` : result.site_hours || '10:00 - 23:00';
    if (result.site_closed) {
      setSiteStatus(
        result.site_closed_until
          ? `Cerrado hasta ${new Date(result.site_closed_until).toLocaleDateString('es-PE', {
              day: '2-digit',
              month: 'long',
            })}`
          : result.site_closed_text || 'Abre mañana'
      );
    } else {
      setSiteStatus(`Abierto todos los días de ${hoursDisplay}`);
    }
  };

  useEffect(() => {
    loadPayments();
    loadSync();
    loadAllowedSenders();
    loadSiteStatus();

    if (typeof window !== 'undefined' && window.EventSource) {
      let eventSource;
      try {
        eventSource = new EventSource('/api/notifications/subscribe');
      } catch (err) {
        console.warn('EventSource failed to initialize:', err);
        setStatus('No se pudo iniciar SSE de notificaciones.');
        return;
      }
      eventSource.addEventListener('payment-notification', async (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          const paymentsFromNotification = Array.isArray(payload.payments) ? payload.payments : [];
          paymentsFromNotification.forEach((payment) => {
            if (!knownPaymentIdsRef.current.has(payment.email_id)) {
              addToast(payment);
              knownPaymentIdsRef.current.add(payment.email_id);
            }
          });
          if (paymentsFromNotification.length) {
            await loadPayments();
          }
        } catch (err) {
          console.warn('Failed to parse SSE payment notification:', err);
        }
      });
      eventSource.onerror = (err) => {
        console.warn('SSE connection to /api/notifications/subscribe closed or errored.', err);
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
        }
      };
      return () => {
        if (eventSource) eventSource.close();
      };
    }
  }, []);

  useEffect(() => { loadAdminGames(); }, []);

  const lastHistoryRef = useRef(null);
  const fallbackRefreshRef = useRef(0);
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const newSync = await loadSync();
        if (newSync?.watch_enabled && newSync?.history_id) {
          if (newSync.history_id !== lastHistoryRef.current) {
            lastHistoryRef.current = newSync.history_id;
            setStatus('Nuevos mensajes detectados; refrescando pagos...');
            await fetchJson('/api/payments/refresh', {
              method: 'POST',
              body: JSON.stringify({ history_id: newSync.history_id }),
            });
            await loadPayments(true);
            setStatus('Auto-refresh completado.');
          } else {
            const now = Date.now();
            const fallbackInterval = 60_000;
            if (now - fallbackRefreshRef.current > fallbackInterval) {
              fallbackRefreshRef.current = now;
              setStatus('Watch activo; verificando nuevos mensajes...');
              await fetchJson('/api/payments/refresh', {
                method: 'POST',
                body: JSON.stringify({ history_id: newSync.history_id }),
              });
              await loadPayments(true);
              setStatus('Verificación completada.');
            }
          }
        }
      } catch (e) {
        // ignore transient errors
      }
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="app-shell">
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <button className="toast__close" onClick={() => dismissToast(toast.id)} aria-label="Cerrar notificación">×</button>
            <p className="toast__title">Nuevo pago detectado</p>
            <p className="toast__meta"><strong>{toast.customer}</strong><span>{toast.time}</span></p>
            <p className="toast__amount">{toast.amount}</p>
          </div>
        ))}
      </div>
      <header>
        <h1>Administración Global</h1>
        <p>Panel de administración de pagos de Gmail.</p>
      </header>

      <section className="controls">
        <div className="watch-status">
          <span className={`watch-badge ${watchEnabled ? 'watch-badge--on' : 'watch-badge--off'}`}>
            {watchEnabled ? 'Watch: ON' : 'Watch: OFF'}
          </span>
        </div>
        <button onClick={registerWatch}>Iniciar watch de Gmail</button>
        <button onClick={stopWatch}>Detener watch</button>
        <button onClick={refreshPayments}>Actualizar pagos</button>
      </section>

      <section className="site-status">
        <h2>Control de horario</h2>
        <div className="site-status__row">
          <label className="site-status__toggle">
            <input
              type="checkbox"
              checked={siteClosed}
              onChange={(event) => setSiteClosed(event.target.checked)}
            />
            <span>Cerrar temporalmente</span>
          </label>
          <label className="site-status__date">
            <span>Hasta</span>
            <input
              type="date"
              value={siteClosedUntil}
              onChange={(event) => setSiteClosedUntil(event.target.value)}
              disabled={!siteClosed}
            />
          </label>
        </div>
        <div className="site-status__row">
          <label className="site-status__text">
            <span>Texto al cerrar</span>
            <input
              type="text"
              value={siteClosedText}
              onChange={(event) => setSiteClosedText(event.target.value)}
              placeholder="Abre mañana"
              disabled={!siteClosed}
            />
          </label>
        </div>
        <div className="site-status__row">
          <label className="site-status__hours">
            <span>Inicio</span>
            <input
              type="time"
              value={siteHoursStart}
              onChange={(event) => setSiteHoursStart(event.target.value)}
            />
          </label>
          <label className="site-status__hours">
            <span>Fin</span>
            <input
              type="time"
              value={siteHoursEnd}
              onChange={(event) => setSiteHoursEnd(event.target.value)}
            />
          </label>
        </div>
        <div className="site-status__actions">
          <button onClick={saveSiteStatus}>Guardar estado</button>
          <span className="site-status__current">{siteStatus}</span>
        </div>
      </section>

      <section className="allowed-senders">
        <h2>Remitentes permitidos</h2>
        <textarea
          value={allowedSendersText}
          onChange={(event) => setAllowedSendersText(event.target.value)}
          rows={6}
          placeholder="one@example.com\nanother@example.com"
        />
        <div>
          <button onClick={saveAllowedSenders}>Guardar remitentes</button>
        </div>
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
              <th>Monto</th>
              <th>Cliente</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {payments.length > 0 ? (
              payments.map((payment) => (
                (() => {
                  const parsed = parseWithConfig(payment);
                  return (
                    <tr key={payment.id}>
                      <td>{payment.email_id}</td>
                      <td>{(payment.parsed_amount ?? payment.amount) ?? '-'}</td>
                      <td>{payment.parsed_customer || parsed.extractedName || payment.sender || '-'}</td>
                      <td>{payment.transaction_date ? new Date(payment.transaction_date).toLocaleString() : '-'}</td>
                    </tr>
                  );
                })()
              ))
            ) : (
              <tr>
                <td colSpan="4">No se encontraron pagos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="parser-config">
        <h2>Parser: configuración de extracción</h2>
        <p>Expresiones regulares (JavaScript). <strong>amountRegex</strong> debe capturar el monto en un grupo, <strong>nameRegex</strong> debe capturar el nombre en un grupo.</p>
        <label>amountRegex</label>
        <input
          type="text"
          value={parserConfig.amountRegex}
          onChange={(e) => setParserConfig((s) => ({ ...s, amountRegex: e.target.value }))}
          style={{ width: '100%' }}
        />

        <label>nameRegex</label>
        <input
          type="text"
          value={parserConfig.nameRegex}
          onChange={(e) => setParserConfig((s) => ({ ...s, nameRegex: e.target.value }))}
          style={{ width: '100%' }}
        />

        <div style={{ marginTop: 8 }}>
          <button onClick={saveParserConfig}>Guardar parser</button>
          <button onClick={() => { localStorage.removeItem('paymentsParserConfig'); setParserConfig({ amountRegex: "S\/\s?([0-9]+(?:[\.,][0-9]{1,2})?)|([0-9]+(?:[\.,][0-9]{2}))", nameRegex: "enviado por\s*([A-Z][^\n\r<]+)" }); setStatus('Parser restaurado a valores por defecto.'); }} style={{ marginLeft: 8 }}>Restaurar</button>
        </div>
      </section>

      <section className="games-admin">
        <h2>Administración de Juegos</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="Buscar juegos" value={gamesQuery} onChange={(e) => setGamesQuery(e.target.value)} />
          <button onClick={() => loadAdminGames(gamesQuery)}>Buscar</button>
          <button onClick={() => { setGamesQuery(''); loadAdminGames(''); }}>Reset</button>
        </div>
        <CreateGameForm onSave={createOrUpdateGame} />
        <table>
          <thead>
            <tr><th>Nombre</th><th>Slug</th><th>Plataformas</th><th>Disabled</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {adminGames.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{g.slug}</td>
                <td>{(g.platforms || []).map(p => p.name || p.key).join(', ')}</td>
                <td><input type="checkbox" checked={!!g.disabled} onChange={(e) => toggleGameDisabled(g.id, e.target.checked)} /></td>
                <td><button onClick={() => deleteGame(g.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;

function CreateGameForm({ onSave }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [platforms, setPlatforms] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const platArr = platforms.split(',').map(s => s.trim()).filter(Boolean).map((p) => ({ name: p }));
    await onSave({ name, slug: slug || undefined, platforms: platArr });
    setName(''); setSlug(''); setPlatforms('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 12 }}>
      <input placeholder="Nombre del juego" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="Slug (opcional)" value={slug} onChange={(e) => setSlug(e.target.value)} />
      <input placeholder="Plataformas (coma separada: Steam, Epic)" value={platforms} onChange={(e) => setPlatforms(e.target.value)} />
      <button type="submit">Agregar/Guardar</button>
    </form>
  );
}
