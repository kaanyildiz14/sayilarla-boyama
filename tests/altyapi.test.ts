import { describe, expect, it, vi } from 'vitest';
import { Durum } from '../src/durum';
import { ayniRota, rotaAdresi, rotayiCoz } from '../src/yonlendirme';

describe('Durum', () => {
  it('değişince abonelere eski ve yeni değeri bildirir', () => {
    const d = new Durum(1);
    const dinleyici = vi.fn();
    d.abone(dinleyici);
    d.set(2);
    expect(d.get()).toBe(2);
    expect(dinleyici).toHaveBeenCalledWith(2, 1);
  });

  it('aynı değer için haber vermez, abonelik bırakılabilir', () => {
    const d = new Durum('a');
    const dinleyici = vi.fn();
    const birak = d.abone(dinleyici);
    d.set('a');
    birak();
    d.set('b');
    expect(dinleyici).not.toHaveBeenCalled();
  });
});

describe('yönlendirme', () => {
  it('adresleri çözer', () => {
    expect(rotayiCoz('')).toEqual({ ad: 'baslangic' });
    expect(rotayiCoz('#/')).toEqual({ ad: 'baslangic' });
    expect(rotayiCoz('#/boya/abc-123')).toEqual({ ad: 'boya', id: 'abc-123' });
    expect(rotayiCoz('#/bilinmeyen')).toEqual({ ad: 'baslangic' });
  });

  it('adres üretir ve geri çözer', () => {
    const r = { ad: 'boya', id: 'a b/c' } as const;
    expect(rotayiCoz(rotaAdresi(r))).toEqual(r);
    expect(ayniRota(r, { ad: 'boya', id: 'a b/c' })).toBe(true);
    expect(ayniRota(r, { ad: 'baslangic' })).toBe(false);
  });
});
