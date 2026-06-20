import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthResponse, LoginInput, RefreshInput, RegisterInput, UserRole } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { AppConfig } from '../common/config';
import { CharactersService } from '../characters/characters.service';
import { moderateDisplayName } from '../ai/moderation';

const BCRYPT_ROUNDS = 10;

interface RefreshPayload {
  sub: string;
  ver: number;
  typ: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly characters: CharactersService,
    private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterInput): Promise<AuthResponse> {
    const username = dto.username.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new ConflictException('Username is taken');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const displayName = dto.displayName?.trim() || dto.username;

    // Display name is broadcast publicly (chat, search, leaderboards, profiles),
    // so it is moderated and must be unique case-insensitively. Both checks are
    // server-side; the client cannot bypass them.
    const nameCheck = moderateDisplayName(displayName);
    if (!nameCheck.safe) {
      throw new BadRequestException(`Display name rejected (${nameCheck.reason ?? 'unsafe'})`);
    }
    const nameTaken = await this.prisma.character.findFirst({
      where: { displayName: { equals: displayName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (nameTaken) throw new ConflictException('That display name is taken');

    const user = await this.prisma.user.create({
      data: { username, displayName, passwordHash, role: 'player' },
      select: { id: true, username: true, role: true, tokenVersion: true },
    });

    // One character per user for MVP — created immediately so the session is
    // playable right after registration.
    await this.characters.createForUser(user.id, displayName);

    return this.issue(user.id, user.username, user.role as UserRole, user.tokenVersion);
  }

  async login(dto: LoginInput): Promise<AuthResponse> {
    const username = dto.username.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.bannedAt) throw new UnauthorizedException('This account has been suspended');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issue(user.id, user.username, user.role as UserRole, user.tokenVersion);
  }

  /** Exchange a valid refresh token for a fresh access (+ refresh) token pair. */
  async refresh(dto: RefreshInput): Promise<AuthResponse> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(dto.refreshToken, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Not a refresh token');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Account not found');
    if (user.bannedAt) throw new UnauthorizedException('This account has been suspended');
    if ((payload.ver ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session expired — please log in again');
    }
    return this.issue(user.id, user.username, user.role as UserRole, user.tokenVersion);
  }

  /** Bump the token version, invalidating every outstanding access + refresh token. */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }

  private async issue(userId: string, username: string, role: UserRole, tokenVersion: number): Promise<AuthResponse> {
    const token = await this.jwt.signAsync(
      { sub: userId, username, role, ver: tokenVersion },
      { expiresIn: this.config.accessExpiresIn },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, ver: tokenVersion, typ: 'refresh' },
      { expiresIn: this.config.refreshExpiresIn },
    );
    return { token, refreshToken, user: { id: userId, username, role } };
  }
}
