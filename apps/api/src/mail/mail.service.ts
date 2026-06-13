import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MailboxView, MailView, SendMailInput } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { moderateText } from '../ai/moderation';

/**
 * Private mail (inbox/outbox). Moderated; blocked recipients reject your mail.
 * Deletes are per-side soft deletes so the other party keeps their copy.
 */
@Injectable()
export class MailService {
  constructor(private readonly prisma: PrismaService) {}

  async mailbox(characterId: string): Promise<MailboxView> {
    const [inboxRows, outboxRows] = await Promise.all([
      this.prisma.mailMessage.findMany({
        where: { recipientCharacterId: characterId, deletedByRecipient: false },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { sender: { select: { displayName: true } } },
      }),
      this.prisma.mailMessage.findMany({
        where: { senderCharacterId: characterId, deletedBySender: false },
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
    const recipient = await this.prisma.character.findFirst({
      where: { displayName: { equals: dto.recipientName.trim(), mode: 'insensitive' } },
      select: { id: true, displayName: true },
    });
    if (!recipient) throw new NotFoundException('No player by that name');
    if (recipient.id === senderId) throw new BadRequestException('You cannot mail yourself');

    const blocked = await this.prisma.blockedUser.findFirst({
      where: { characterId: recipient.id, blockedCharacterId: senderId },
    });
    if (blocked) throw new BadRequestException('This player is not accepting your mail');

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
