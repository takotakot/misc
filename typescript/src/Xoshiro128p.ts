/**
 * Xoshiro128p PRNG.
 *
* Generates random numbers with reproducible and statistically superior characteristics for testing purposes.
 */
export class Xoshiro128p {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(z: number = 0x9e3779b9) {
    // splitmix32a variant
    // See below:
    // https://github.com/bryc/code/blob/master/jshash/PRNGs.md#splitmix32
    // https://github.com/joelkp/ranoise?tab=readme-ov-file#splitmix32a
    const updateZ = () => {
      z = Math.imul((z ^ (z >>> 16)), 0x21f0aaad);
      z = Math.imul((z ^ (z >>> 15)), 0x735a2d97);
      return (z = z ^ (z >>> 15));
    }
    this.s0 = updateZ();
    this.s1 = updateZ();
    this.s2 = updateZ();
    this.s3 = updateZ();
  }

  public uint32(): number {
    // https://github.com/bryc/code/blob/master/jshash/PRNGs.md#xoshiro
    let t = this.s1 << 9;
    let r = this.s0 + this.s3;
    this.s2 = this.s2 ^ this.s0;
    this.s3 = this.s3 ^ this.s1;
    this.s1 = this.s1 ^ this.s2;
    this.s0 = this.s0 ^ this.s3;
    this.s2 = this.s2 ^ t;
    this.s3 = this.s3 << 11 | this.s3 >>> 21;
    return r >>> 0;
  }

  public uniform01(): number {
    return this.uint32() / 4294967296;
  }
}
