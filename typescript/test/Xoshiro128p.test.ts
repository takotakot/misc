import { Xoshiro128p } from '../src/Xoshiro128p';

describe('Xoshiro128p', () => {
  let rng: Xoshiro128p;

  beforeEach(() => {
    rng = new Xoshiro128p();
  });

  test('uint32 should return a number between 0 and 2^32 - 1', () => {
    // Limited to 100 samples to keep the test fast.
    const numSamples = 100;
    const samples = Array.from({ length: numSamples }, () => rng.uint32());

    const max = samples.reduce((acc, x) => Math.max(acc, x), Number.MIN_SAFE_INTEGER);
    expect(max).toBeLessThan(2 ** 32);

    const min = samples.reduce((acc, x) => Math.min(acc, x), Number.MAX_SAFE_INTEGER);
    expect(min).toBeGreaterThanOrEqual(0);
  });

  test('uniform01 should return a number between 0 and 1', () => {
    const value = rng.uniform01();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  test('uniform01 should return different values on subsequent calls', () => {
    const value1 = rng.uniform01();
    const value2 = rng.uniform01();
    expect(value1).not.toBe(value2);
  });

  test('uniform01 should produce reproducible results with the same seed', () => {
    const seed = 0x9e3779b9;
    const rng1 = new Xoshiro128p(seed);
    const rng2 = new Xoshiro128p(seed);

    for (let i = 0; i < 10; i++) {
      expect(rng1.uniform01()).toBe(rng2.uniform01());
    }
  });

  test('uniform01 should produce numbers with a mean value of 0.5 and a variance of 1/12 with a large number of samples', () => {
    // Limited to 100 samples to keep the test fast.
    const numSamples = 100;
    const samples = Array.from({ length: numSamples }, () => rng.uniform01());

    const mean = samples.reduce((acc, x) => acc + x, 0) / numSamples;
    expect(mean).toBeCloseTo(0.5, 2);

    const variance = samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / numSamples;
    expect(variance).toBeCloseTo(1 / 12, 2);
  });
});
