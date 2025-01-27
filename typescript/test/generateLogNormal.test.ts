import { NumberGenerator, RandomNumberGenerator } from '../src/NumberGenerator';

describe('NumberGenerator', () => {
  let rng: NumberGenerator;

  beforeEach(() => {
    rng = new RandomNumberGenerator();
  });

  test.skip('Call logNormal many times', () => {
    const numSamples = 500;
    // test1: { mean: 15.688, sd: 1.22 }
    // test2: { mean: 15.527, sd: 0.64 }
    const samples = Array.from({ length: numSamples }, () => rng.logNormal({ mean: 15.527, sd: 0.64 }));

    samples.map((x) => { process.stdout.write(`${x}\n`); });
  });
});
