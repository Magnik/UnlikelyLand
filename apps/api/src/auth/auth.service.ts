import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthResponse, LoginInput, RegisterInput, UserRole } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { CharactersService } from '../characters/characters.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly characters: CharactersService,
  ) {}

  async register(dto: RegisterInput): Promise<AuthResponse> {
    const username = dto.username.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new ConflictException('Username is taken');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const displayName = dto.displayName?.trim() || dto.username;

    const user = await this.prisma.user.create({
      data: { username, displayName, passwordHash, role: 'player' },
      select: { id: true, username: true, role: true },
    });

    // One character per user for MVP — created immediately so the session is
    // playable right after registration.
    await this.characters.createForUser(user.id, displayName);

    return this.issue(user.id, user.username, user.role as UserRole);
  }

  async login(dto: LoginInput): Promise<AuthResponse> {
    const username = dto.username.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issue(user.id, user.username, user.role as UserRole);
  }

  private async issue(userId: string, username: string, role: UserRole): Promise<AuthResponse> {
    const token = await this.jwt.signAsync({ sub: userId, username, role });
    return { token, user: { id: userId, username, role } };
  }
}
