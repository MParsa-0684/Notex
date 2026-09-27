import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function deriveScrypt(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export type UserRole = "admin" | "user";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
};

type PasswordRecord = {
  algorithm: "scrypt";
  salt: string;
  digest: string;
  cost: number;
  blockSize: number;
  parallelization: number;
};

type UserRecord = PublicUser & {
  emailCanonical: string;
  password: PasswordRecord;
};

type AccountSession = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

type AuthDatabase = {
  version: 1;
  users: UserRecord[];
  sessions: AccountSession[];
};

type ScryptPolicy = {
  cost: number;
  blockSize: number;
  parallelization: number;
  maxmem: number;
};

type AuthServiceOptions = {
  sessionTtlHours?: number;
  scryptPolicy?: ScryptPolicy;
};

const defaultScryptPolicy: ScryptPolicy = {
  cost: 2 ** 17,
  blockSize: 8,
  parallelization: 1,
  maxmem: 192 * 1024 * 1024,
};

const EMPTY_DATABASE: AuthDatabase = { version: 1, users: [], sessions: [] };
const AUTH_AAD = Buffer.from("notex-auth-v1");
const SESSION_IDLE_TIMEOUT_MS = 60 * 60_000;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "AUTH_REQUIRED" | "FORBIDDEN" | "INVALID_CREDENTIALS" | "CONFLICT" | "INVALID_INPUT",
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    disabled: user.disabled,
    createdAt: user.createdAt,
  };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

function tokenHashMatches(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "base64url");
  const rightBytes = Buffer.from(right, "base64url");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function passwordBytes(password: string): number {
  return Buffer.byteLength(password.normalize("NFKC"), "utf8");
}

function validatePassword(password: string): void {
  if (password.length < 12) throw new AuthError("Use at least 12 characters for the password.", "INVALID_INPUT", 400);
  if (password.length > 128 || passwordBytes(password) > 512) throw new AuthError("The password is too long.", "INVALID_INPUT", 400);
}

function validateIdentity(name: string, email: string): { name: string; email: string; canonical: string } {
  const cleanName = name.trim().normalize("NFKC");
  const cleanEmail = email.trim().normalize("NFKC");
  const canonical = normalizeEmail(cleanEmail);
  if (cleanName.length < 2 || cleanName.length > 80) throw new AuthError("Enter a name between 2 and 80 characters.", "INVALID_INPUT", 400);
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new AuthError("Enter a valid email address.", "INVALID_INPUT", 400);
  return { name: cleanName, email: cleanEmail, canonical };
}

async function hashPassword(password: string, policy: ScryptPolicy): Promise<PasswordRecord> {
  validatePassword(password);
  const normalized = password.normalize("NFKC");
  const salt = randomBytes(16);
  const digest = await deriveScrypt(normalized, salt, 32, {
    N: policy.cost,
    r: policy.blockSize,
    p: policy.parallelization,
    maxmem: policy.maxmem,
  });
  return {
    algorithm: "scrypt",
    salt: salt.toString("base64"),
    digest: digest.toString("base64"),
    cost: policy.cost,
    blockSize: policy.blockSize,
    parallelization: policy.parallelization,
  };
}

async function verifyPassword(password: string, record: PasswordRecord, maxmem = 192 * 1024 * 1024): Promise<boolean> {
  if (password.length > 128 || passwordBytes(password) > 512) return false;
  const expected = Buffer.from(record.digest, "base64");
  const actual = await deriveScrypt(password.normalize("NFKC"), Buffer.from(record.salt, "base64"), expected.length, {
    N: record.cost,
    r: record.blockSize,
    p: record.parallelization,
    maxmem,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class AuthService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly sessionTtlMs: number;
  private readonly policy: ScryptPolicy;
  private readonly dummyPassword: Promise<PasswordRecord>;

  constructor(
    private readonly path: string,
    private readonly key: Buffer,
    options: AuthServiceOptions = {},
  ) {
    const requestedTtl = options.sessionTtlHours ?? 12;
    const sessionTtlHours = Number.isFinite(requestedTtl) ? Math.max(1, Math.min(168, requestedTtl)) : 12;
    this.sessionTtlMs = sessionTtlHours * 60 * 60_000;
    this.policy = options.scryptPolicy ?? defaultScryptPolicy;
    this.dummyPassword = hashPassword(randomBytes(24).toString("base64url"), this.policy);
  }

  async status(): Promise<{ setupRequired: boolean }> {
    const database = await this.read();
    return { setupRequired: database.users.length === 0 };
  }

  async registerOwner(name: string, email: string, password: string): Promise<{ user: PublicUser; token: string }> {
    return this.mutate(async (database) => {
      if (database.users.length !== 0) throw new AuthError("Notex already has an owner. Ask an administrator to create your account.", "FORBIDDEN", 403);
      const identity = validateIdentity(name, email);
      const user: UserRecord = {
        id: randomUUID(),
        email: identity.email,
        emailCanonical: identity.canonical,
        name: identity.name,
        role: "admin",
        disabled: false,
        createdAt: new Date().toISOString(),
        password: await hashPassword(password, this.policy),
      };
      database.users.push(user);
      const token = this.addSession(database, user.id);
      return { user: publicUser(user), token };
    });
  }

  async login(email: string, password: string): Promise<{ user: PublicUser; token: string }> {
    return this.mutate(async (database) => {
      const canonical = normalizeEmail(email);
      const user = database.users.find((candidate) => candidate.emailCanonical === canonical);
      const passwordRecord = user?.password ?? await this.dummyPassword;
      const valid = await verifyPassword(password, passwordRecord, Math.max(this.policy.maxmem, 192 * 1024 * 1024));
      if (!user || !valid || user.disabled) throw new AuthError("The email or password is incorrect.", "INVALID_CREDENTIALS", 401);
      database.sessions = database.sessions.filter((session) => session.userId !== user.id || new Date(session.expiresAt).getTime() > Date.now());
      const token = this.addSession(database, user.id);
      return { user: publicUser(user), token };
    });
  }

  async requireUser(token: string | undefined): Promise<PublicUser> {
    return this.mutate(async (database) => {
      const user = this.resolveSession(database, token);
      return publicUser(user);
    });
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.mutate(async (database) => {
      const hash = tokenHash(token);
      database.sessions = database.sessions.filter((session) => !tokenHashMatches(session.tokenHash, hash));
    });
  }

  async changePassword(token: string | undefined, currentPassword: string, newPassword: string): Promise<{ user: PublicUser; token: string }> {
    return this.mutate(async (database) => {
      const user = this.resolveSession(database, token);
      if (!(await verifyPassword(currentPassword, user.password))) throw new AuthError("The current password is incorrect.", "INVALID_CREDENTIALS", 401);
      user.password = await hashPassword(newPassword, this.policy);
      database.sessions = database.sessions.filter((session) => session.userId !== user.id);
      const nextToken = this.addSession(database, user.id);
      return { user: publicUser(user), token: nextToken };
    });
  }

  async listUsers(token: string | undefined): Promise<PublicUser[]> {
    return this.mutate(async (database) => {
      this.requireAdmin(database, token);
      return database.users.map(publicUser).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
  }

  async createUser(token: string | undefined, name: string, email: string, password: string, role: UserRole): Promise<PublicUser> {
    return this.mutate(async (database) => {
      this.requireAdmin(database, token);
      const identity = validateIdentity(name, email);
      if (database.users.some((candidate) => candidate.emailCanonical === identity.canonical)) throw new AuthError("An account already uses that email address.", "CONFLICT", 409);
      const user: UserRecord = {
        id: randomUUID(),
        email: identity.email,
        emailCanonical: identity.canonical,
        name: identity.name,
        role,
        disabled: false,
        createdAt: new Date().toISOString(),
        password: await hashPassword(password, this.policy),
      };
      database.users.push(user);
      return publicUser(user);
    });
  }

  async setUserDisabled(token: string | undefined, userId: string, disabled: boolean): Promise<PublicUser> {
    return this.mutate(async (database) => {
      const admin = this.requireAdmin(database, token);
      const user = database.users.find((candidate) => candidate.id === userId);
      if (!user) throw new AuthError("The user was not found.", "INVALID_INPUT", 404);
      if (user.id === admin.id && disabled) throw new AuthError("You cannot disable your own account.", "INVALID_INPUT", 400);
      user.disabled = disabled;
      if (disabled) database.sessions = database.sessions.filter((session) => session.userId !== user.id);
      return publicUser(user);
    });
  }

  async resetUserPassword(token: string | undefined, userId: string, password: string): Promise<PublicUser> {
    return this.mutate(async (database) => {
      this.requireAdmin(database, token);
      const user = database.users.find((candidate) => candidate.id === userId);
      if (!user) throw new AuthError("The user was not found.", "INVALID_INPUT", 404);
      user.password = await hashPassword(password, this.policy);
      database.sessions = database.sessions.filter((session) => session.userId !== user.id);
      return publicUser(user);
    });
  }

  private requireAdmin(database: AuthDatabase, token: string | undefined): UserRecord {
    const user = this.resolveSession(database, token);
    if (user.role !== "admin") throw new AuthError("Administrator access is required.", "FORBIDDEN", 403);
    return user;
  }

  private resolveSession(database: AuthDatabase, token: string | undefined): UserRecord {
    if (!token || token.length > 128) throw new AuthError("Sign in to continue.", "AUTH_REQUIRED", 401);
    const now = Date.now();
    const hash = tokenHash(token);
    database.sessions = database.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
    const session = database.sessions.find((candidate) => tokenHashMatches(candidate.tokenHash, hash));
    if (!session || new Date(session.lastSeenAt).getTime() + SESSION_IDLE_TIMEOUT_MS <= now) {
      if (session) database.sessions = database.sessions.filter((candidate) => candidate !== session);
      throw new AuthError("Your session expired. Sign in again.", "AUTH_REQUIRED", 401);
    }
    const user = database.users.find((candidate) => candidate.id === session.userId);
    if (!user || user.disabled) throw new AuthError("Sign in to continue.", "AUTH_REQUIRED", 401);
    session.lastSeenAt = new Date(now).toISOString();
    return user;
  }

  private addSession(database: AuthDatabase, userId: string): string {
    const token = newSessionToken();
    const now = new Date();
    const session: AccountSession = {
      tokenHash: tokenHash(token),
      userId,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.sessionTtlMs).toISOString(),
    };
    const otherSessions = database.sessions.filter((candidate) => candidate.userId !== userId);
    const recentUserSessions = database.sessions.filter((candidate) => candidate.userId === userId).slice(-9);
    database.sessions = [...otherSessions, ...recentUserSessions, session];
    return token;
  }

  private async mutate<T>(operation: (database: AuthDatabase) => Promise<T> | T): Promise<T> {
    const task = this.queue.then(async () => {
      const database = await this.read();
      const result = await operation(database);
      await this.write(database);
      return result;
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async read(): Promise<AuthDatabase> {
    try {
      const envelope = JSON.parse(await readFile(this.path, "utf8")) as { version: 1; iv: string; ciphertext: string; tag: string };
      if (envelope.version !== 1) throw new Error("Unsupported authentication store version.");
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
      decipher.setAAD(AUTH_AAD);
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
      const database = JSON.parse(plaintext.toString("utf8")) as AuthDatabase;
      if (database.version !== 1 || !Array.isArray(database.users) || !Array.isArray(database.sessions)) throw new Error("The authentication store is invalid.");
      return database;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_DATABASE);
      throw error;
    }
  }

  private async write(database: AuthDatabase): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(AUTH_AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(database), "utf8"), cipher.final()]);
    const envelope = {
      version: 1 as const,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(envelope), { mode: 0o600 });
    await rename(temporary, this.path);
  }
}
