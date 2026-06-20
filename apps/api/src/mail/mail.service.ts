import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MailboxView, MailView, SendMailInput } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { RelationshipService } from '../common/relationship.service';
import { moderateText } from '../ai/moderation';

/**
 * Private mail (inbox/outbox). Moderated; blocking is enforced bidirectionally so
 * a block stops delivery either way. Recipients are addressed by characterId
 * (unambiguous) or by an EXACT, case-insensitive, unique display name — a
 * non-unique name is rejected rather than silently misdelivered. Deletes are
 * per-side soft deletes so the other party keeps their copy. Only the sender and
 * recipient can ever read a message.
 */
@Injectable()
export class MailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipService,
  ) {}

  private async assertNotMuted(characterId: string): Promise<void> {
    const c = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: { mutedUntil: true },
    });
    if (c?.mutedUntil && c.mutedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((c.mutedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException(`You are muted for another ${mins} minute(s)`);
    }
  }

  async mailbox(characterId: string): Promise<MailboxView> {
    const [inboxRows, outboxRows] = await Promise.all([
      this.prisma.mailMessage.findMany({
        where: { recipientCharacterId: characterId, deletedByRecipient: false, moderationStatus: 'visible' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { sender: { select: { displayName: true } } },
      }),
      this.prisma.mailMessage.findMany({
        // Hide staff-removed mail from the sender's outbox too (the inbox already
        // filters it), so a moderated message disappears for both parties.
        where: { senderCharacterId: characterId, deletedBySender: false, moderationStatus: 'visible' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { recipient: { select: { displayName: true } } },
      }),
    ]);

    const inbox = inboxRows.map((m): MailView => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      otherCharacterId: m.senderCharacterId,
      otherName: m.sender.displayName,
      direction: 'in',
      read: m.readAt !== null,
      createdAt: m.createdAt.toISOString(),
    }));
    const outbox = outboxRows.map((m): MailView => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      otherCharacterId: m.recipientCharacterId,
      otherName: m.recipient.displayName,
      direction: 'out',
      read: true,
      createdAt: m.createdAt.toISOString(),
    }));

    return { inbox, outbox, unread: inbox.filter((m) => !m.read).length };
  }

  async send(senderId: string, dto: SendMailInput): Promise<MailView> {
    await this.assertNotMuted(senderId);

    const recipient = await this.resolveRecipient(dto);
    if (!recipient) throw new NotFoundException('No player by that name');
    if (recipient.id === senderId) throw new BadRequestException('You cannot mail yourself');

    if (await this.relationships.isBlockedEitherWay(senderId, recipient.id)) {
      throw new BadRequestException('This player is not accepting your mail');
    }

    const mod = moderateText(`${dto.subject ?? ''} ${dto.body}`, 'pg13');
    if (!mod.safe) throw new BadRequestException('Message blocked by moderation');

    const m = await this.prisma.mailMessage.create({
      data: {
        senderCharacterId: senderId,
        recipientCharacterId: recipient.id,
        subject: (dto.subject ?? '').trim(),
        body: dto.body.trim(),
      },
    });
    return {
      id: m.id,
      subject: m.subject,
      body: m.body,
      otherCharacterId: recipient.id,
      otherName: recipient.displayName,
      direction: 'out',
      read: true,
      createdAt: m.createdAt.toISOString(),
    };
  }

  /** Resolve a recipient by id (preferred) or an unambiguous case-insensitive name. */
  private async resolveRecipient(dto: SendMailInput): Promise<{ id: string; displayName: string } | null> {
    if (dto.recipientCharacterId) {
      return this.prisma.character.findUnique({
        where: { id: dto.recipientCharacterId },
        select: { id: true, displayName: true },
      });
    }
    const name = (dto.recipientName ?? '').trim();
    if (!name) return null;
    const matches = await this.prisma.character.findMany({
      where: { displayName: { equals: name, mode: 'insensitive' } },
      select: { id: true, displayName: true },
      take: 2,
    });
    if (matches.length > 1) {
      throw new BadRequestException('More than one player uses that name — open their profile to message them');
    }
    return matches[0] ?? null;
  }

  async markRead(characterId: string, mailId: string) {
    const m = await this.prisma.mailMessage.findUnique({ where: { id: mailId } });
    if (!m || m.recipientCharacterId !== characterId) throw new NotFoundException('Mail not found');
    if (!m.readAt) await this.prisma.mailMessage.update({ where: { id: mailId }, data: { readAt: new Date() } });
    return { read: true };
  }

  async remove(characterId: string, mailId: string) {
    const m = await this.prisma.mailMessage.findUnique({ where: { id: mailId } });
    if (!m) throw new NotFoundException('Mail not found');
    if (m.senderCharacterId === characterId) {
      await this.prisma.mailMessage.update({ where: { id: mailId }, data: { deletedBySender: true } });
    } else if (m.recipientCharacterId === characterId) {
      await this.prisma.mailMessage.update({ where: { id: mailId }, data: { deletedByRecipient: true } });
    } else {
      throw new NotFoundException('Mail not found');
    }
    return { removed: true };
  }
}
