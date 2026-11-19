import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

/** Argon2id hashing (PRD §23). Parameters follow OWASP minimums. */
@Injectable()
export class PasswordService {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Burn comparable CPU when the user doesn't exist to blunt user enumeration via timing. */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash("cartforge-timing-equalizer");
    await this.verify(await this.dummyHash, password);
  }
}
