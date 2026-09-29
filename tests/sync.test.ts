import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { chiudiDb, elencaSopralluoghi, fotoDiSopralluogo, salvaFoto, salvaSopralluogo } from '../src/lib/db';
import { registraEliminazione, salvaConfigSync, sincronizzaOra, verificaConfig } from '../src/lib/sync';
import { sopralluogoCon } from './aiuti';

/** Repository GitHub finto, in memoria, con le sole API usate dalla sincronizzazione. */
function githubFinto(opz: { privato?: boolean } = {}) {
  const file = new Map<string, { sha: string; content: string }>();
  let n = 0;
  let commit = 0;
  const risposta = (status: number, corpo?: unknown) =>
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== 'Bearer segreto') return risposta(401, {});
    const p = u.pathname.replace('/repos/studio/ROA-dati', '');
    const metodo = init?.method ?? 'GET';
    if (p === '' && metodo === 'GET') return risposta(200, { default_branch: 'main', private: opz.privato ?? true, permissions: { push: true } });
    if (p === '/git/trees/main') return risposta(200, { tree: [...file].map(([path, x]) => ({ path, type: 'blob', sha: x.sha })) });
    const blob = /^\/git\/blobs\/(.+)$/.exec(p);
    if (blob) {
      const x = [...file.values()].find((y) => y.sha === blob[1]);
      return x ? risposta(200, { content: x.content }) : risposta(404, {});
    }
    const put = /^\/contents\/(.+)$/.exec(p);
    if (put && metodo === 'PUT') {
      const corpo = JSON.parse(String(init?.body));
      const esistente = file.get(put[1]);
      if (esistente && corpo.sha !== esistente.sha) return risposta(409, {}); // sha obbligatorio e aggiornato
      const sha = `sha${++n}`;
      file.set(put[1], { sha, content: corpo.content });
      commit++;
      return risposta(esistente ? 200 : 201, { content: { sha } });
    }
    return risposta(404, {});
  }) as typeof fetch;
  return { f, file, commit: () => commit };
}

async function nuovoDispositivo() {
  await chiudiDb();
  globalThis.indexedDB = new IDBFactory();
  await salvaConfigSync({ repo: 'studio/ROA-dati', token: 'segreto', nome: 'L.M.' });
}

describe('sincronizzazione tra dispositivi (repository GitHub privato)', () => {
  it('verifica chiave e repository', async () => {
    const gh = githubFinto();
    expect(await verificaConfig({ repo: 'studio/ROA-dati', token: 'segreto', nome: '' }, gh.f)).toBeNull();
    expect(await verificaConfig({ repo: 'studio/ROA-dati', token: 'sbagliato', nome: '' }, gh.f)).toMatch(/non valida/);
    expect(await verificaConfig({ repo: 'https://github.com/studio/ROA-dati', token: 'segreto', nome: '' }, gh.f)).toBeNull();
    const pubblico = githubFinto({ privato: false });
    expect(await verificaConfig({ repo: 'studio/ROA-dati', token: 'segreto', nome: '' }, pubblico.f)).toMatch(/privato/);
  });

  it('PC → telefono: il sopralluogo con le foto compare sull’altro dispositivo; le modifiche tornano indietro', async () => {
    const gh = githubFinto();

    // PC dell'ufficio
    await nuovoDispositivo();
    const s = sopralluogoCon(['77.1.A']);
    s.condominio.nome = 'Torre 4';
    s.voci[0].selezionata = true;
    s.voci[0].fotoIds = ['f-1'];
    await salvaSopralluogo(s);
    await salvaFoto({ id: 'f-1', sopralluogoId: s.id, blob: new Blob([new Uint8Array([0xff, 0xd8, 7])], { type: 'image/jpeg' }), type: 'image/jpeg', width: 4, height: 3, creato: 1 });
    let e = await sincronizzaOra({ fetch: gh.f });
    expect(e).toMatchObject({ inviati: 1, foto: 1 });
    expect([...gh.file.keys()].sort()).toEqual([`foto/f-1.jpg`, `sopralluoghi/${s.id}.json`]);
    // niente di nuovo: nessun invio
    expect(await sincronizzaOra({ fetch: gh.f })).toMatchObject({ inviati: 0, ricevuti: 0 });

    // telefono
    await nuovoDispositivo();
    e = await sincronizzaOra({ fetch: gh.f });
    expect(e).toMatchObject({ ricevuti: 1, foto: 1, inviati: 0 });
    const [arrivato] = await elencaSopralluoghi();
    expect(arrivato.condominio.nome).toBe('Torre 4');
    const foto = await fotoDiSopralluogo(s.id);
    expect(new Uint8Array(await foto[0].blob.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 7]));
    expect(foto[0]).toMatchObject({ width: 4, height: 3, type: 'image/jpeg' });

    // modifica dal telefono → inviata con lo sha aggiornato
    await salvaSopralluogo({ ...arrivato, notaBene: 'dal cantiere', modificato: arrivato.modificato + 1000 });
    expect(await sincronizzaOra({ fetch: gh.f })).toMatchObject({ inviati: 1, foto: 0 });
  });

  it('vince la modifica più recente; un sopralluogo aperto nell’editor non viene sostituito', async () => {
    const gh = githubFinto();
    await nuovoDispositivo();
    const s = sopralluogoCon(['74.1.A']);
    await salvaSopralluogo({ ...s, modificato: 1000 });
    await sincronizzaOra({ fetch: gh.f });

    // un altro dispositivo lo modifica dopo
    const altro = JSON.parse(atob(gh.file.get(`sopralluoghi/${s.id}.json`)!.content));
    altro.sopralluogo = { ...altro.sopralluogo, notaBene: 'altro', modificato: 5000 };
    const contenuto = btoa(unescape(encodeURIComponent(JSON.stringify(altro))));
    gh.file.set(`sopralluoghi/${s.id}.json`, { sha: 'sha-altro', content: contenuto });

    // aperto nell'editor: rimandato, e non sovrascritto con la versione vecchia
    expect(await sincronizzaOra({ fetch: gh.f, aperto: s.id })).toMatchObject({ ricevuti: 0, inviati: 0 });
    expect(gh.file.get(`sopralluoghi/${s.id}.json`)!.sha).toBe('sha-altro');
    // chiuso: arriva la versione più recente
    expect(await sincronizzaOra({ fetch: gh.f })).toMatchObject({ ricevuti: 1 });
    expect((await elencaSopralluoghi())[0].notaBene).toBe('altro');
  });

  it('le cancellazioni raggiungono gli altri dispositivi', async () => {
    const gh = githubFinto();
    await nuovoDispositivo();
    const s = sopralluogoCon(['75.2.B']);
    await salvaSopralluogo(s);
    await sincronizzaOra({ fetch: gh.f });

    await nuovoDispositivo(); // telefono: lo riceve
    await sincronizzaOra({ fetch: gh.f });
    expect(await elencaSopralluoghi()).toHaveLength(1);

    // sul telefono lo si elimina
    const { eliminaSopralluogo } = await import('../src/lib/db');
    await eliminaSopralluogo(s.id);
    await registraEliminazione(s.id);
    expect(await sincronizzaOra({ fetch: gh.f })).toMatchObject({ eliminati: 1 });
    expect(JSON.parse(atob(gh.file.get(`sopralluoghi/${s.id}.json`)!.content))).toMatchObject({ eliminato: true });

    // un terzo dispositivo che lo aveva: sparisce
    await nuovoDispositivo();
    await salvaSopralluogo(s);
    await sincronizzaOra({ fetch: gh.f });
    expect(await elencaSopralluoghi()).toHaveLength(0);
  });

  it('chiave errata: messaggio chiaro, nessuna perdita di dati', async () => {
    const gh = githubFinto();
    await nuovoDispositivo();
    await salvaConfigSync({ repo: 'studio/ROA-dati', token: 'sbagliato', nome: '' });
    const s = sopralluogoCon(['77.1.A']);
    await salvaSopralluogo(s);
    await expect(sincronizzaOra({ fetch: gh.f })).rejects.toThrow(/Chiave di accesso non valida/);
    expect(await elencaSopralluoghi()).toHaveLength(1);
  });
});
