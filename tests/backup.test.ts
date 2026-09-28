import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { creaBackup, importaBackup } from '../src/lib/backup';
import { duplicaSopralluogo, eliminaSopralluogo, fotoDiSopralluogo, leggiSopralluogo, salvaFoto, salvaSopralluogo } from '../src/lib/db';
import { sopralluogoCon } from './aiuti';

describe('archivio e backup', () => {
  it('salva, esporta, reimporta e duplica con le foto', async () => {
    const s = sopralluogoCon(['77.1.A']);
    s.condominio.committente = 'Condominio Beta';
    s.voci[0].fotoIds = ['f-1'];
    await salvaSopralluogo(s);
    await salvaFoto({ id: 'f-1', sopralluogoId: s.id, blob: new Blob([new Uint8Array([0xff, 0xd8, 1, 2])], { type: 'image/jpeg' }), type: 'image/jpeg', width: 4, height: 3, creato: 1 });

    const backup = JSON.parse(JSON.stringify(await creaBackup()));
    expect(backup.sopralluoghi).toHaveLength(1);
    expect(backup.foto[0].data).toBe('/9gBAg==');

    await eliminaSopralluogo(s.id);
    expect(await leggiSopralluogo(s.id)).toBeUndefined();
    expect(await fotoDiSopralluogo(s.id)).toHaveLength(0);

    const esito = await importaBackup(JSON.stringify(backup));
    expect(esito).toEqual({ importati: 1, saltati: 0, foto: 1 });
    const foto = await fotoDiSopralluogo(s.id);
    expect(new Uint8Array(await foto[0].blob.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 1, 2]));

    // stesso backup di nuovo: il dato locale non è più vecchio → saltato
    expect((await importaBackup(JSON.stringify(backup))).saltati).toBe(1);

    const copia = (await duplicaSopralluogo(s.id))!;
    expect(copia.id).not.toBe(s.id);
    expect(copia.condominio.committente).toBe('Condominio Beta (copia)');
    const fotoCopia = await fotoDiSopralluogo(copia.id);
    expect(fotoCopia).toHaveLength(1);
    expect(copia.voci[0].fotoIds).toEqual([fotoCopia[0].id]);
  });

  it('rifiuta file non validi', async () => {
    await expect(importaBackup('non json')).rejects.toThrow(/JSON/);
    await expect(importaBackup('{"a":1}')).rejects.toThrow(/backup/);
  });
});
