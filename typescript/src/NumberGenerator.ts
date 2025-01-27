export interface NumberGenerator {
  uniform01(): number;
  normal(option?: { mean?: number; sd?: number }): number;
  logNormal(option?: { mean?: number; sd?: number }): number;
}

export class RandomNumberGenerator implements NumberGenerator {
  /**
   * @param rng function that generates a random number between 0 and 1 ([0,1)), default is Math.random
   */
  constructor(private readonly rng: () => number = Math.random) {}

  uniform01(): number {
    return this.rng();
  }

  normal({ mean = 0, sd = 1 }: { mean?: number; sd?: number } = {}): number {
    return mean + sd * Math.sqrt(-2 * Math.log(this.rng())) * Math.cos(2 * Math.PI * this.rng());
  }

  logNormal({ mean = 0, sd = 1 }: { mean?: number; sd?: number } = {}): number {
    return Math.exp(this.normal({ mean, sd }));
  }
}
