/* Dati fittizi per verificare il campetto senza contattare Google Sheets. */
(() => {
  const saved = new Map();
  const players = ['Mario Prova', 'Luca Prova', 'Anna Prova', 'Paolo Prova'].map((name, index) => ({ name, row: index + 3, statsGlobal: { p: 0, a: 0, g: 0, i: 0 } }));
  const tempo = () => ({ titolari: {}, piazzati: {}, difesaCorner: {}, sostituzioni: {} });
  const initial = () => ({ convocati: null, gameId: '', prestiti: [], tempo1: { titolari: { POR: 'Mario Prova', PUNTA: 'Luca Prova' }, piazzati: { angoli: 'Luca Prova' }, difesaCorner: { palo: 'Mario Prova' }, sostituzioni: {} }, tempo2: { ...tempo(), titolari: { POR: 'Anna Prova' } }, tempo3: tempo(), tempo4: tempo() });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, options = {}) => {
    const request = new URL(url, window.location.href);
    if (request.origin !== 'https://script.google.com') return realFetch(url, options);
    let response;
    if (options.method === 'POST') {
      const data = JSON.parse(options.body);
      if (data.action !== 'saveLineup') throw new Error('Questa prova permette soltanto il salvataggio fittizio della formazione');
      saved.set(`${data.team}:${data.group || ''}`, data.lineup);
      response = { status: 'success' };
    } else {
      const team = request.searchParams.get('team'), mode = request.searchParams.get('mode');
      if (mode === 'formazioni') response = { status: 'success', team, group: request.searchParams.get('group') || '', lineups: saved.get(`${team}:${request.searchParams.get('group') || ''}`) || initial() };
      else if (mode === 'calendario') response = { status: 'success', games: [], coaches: [] };
      else response = { status: 'success', team, players, events: [], attendanceMap: {} };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(response) };
  };
  if (new URLSearchParams(window.location.search).has('blocked-confirm')) window.confirm = () => false;
})();
